import fs from 'fs';
import path from 'path';
import { FileNode, GetRepoMapParams, GetRepoMapResponse } from '../types/mcp';
import { logger } from '../services/loggerService';

const TOKEN_CHAR_RATIO = 4; // Average characters per token
const MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION = 1024 * 1024; // 1MB

// Function to check if a file is a test file
function isTestFile(filename: string): boolean {
  return filename.endsWith('.test.ts') || filename.endsWith('.spec.ts') || filename.endsWith('.test.js') || filename.endsWith('.spec.js');
}

// Function to estimate tokens for a given file
function estimateTokens(filePath: string, fileSize: number): number {
  if (fileSize > MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION) {
    logger.debug(`Skipping token estimation for large file: ${filePath} (Size: ${fileSize} bytes)`);
    // Return a default token count or a count based on partial read
    // For simplicity, we'll return a token count based on max size
    return MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION / TOKEN_CHAR_RATIO;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return Math.ceil(content.length / TOKEN_CHAR_RATIO);
  } catch (error) {
    logger.warn(`Could not read file for token estimation: ${filePath}. Error: ${error}`);
    return 0;
  }
}


export async function get_repo_map(params: GetRepoMapParams): Promise<GetRepoMapResponse> {
  const { path: repoPath, depth = 5, include_tests = false } = params;

  if (!fs.existsSync(repoPath)) {
    logger.warn(`get_repo_map: Repository path not found: ${repoPath}`);
    throw new Error(`Repository path not found: ${repoPath}`);
  }

  let totalFiles = 0;
  let overallTotalTokensEstimated = 0;

  async function traverse(currentPath: string, currentDepth: number): Promise<FileNode[]> {
    if (currentDepth > depth) {
      return [];
    }

    const nodes: FileNode[] = [];
    let directoryTokensEstimated = 0;

    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip node_modules, .git, and dist folders
      if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist')) {
        continue;
      }

      // Skip test files if include_tests is false
      if (entry.isFile() && !include_tests && isTestFile(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        const children = await traverse(fullPath, currentDepth + 1);
        const node: FileNode = {
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: children,
          total_tokens_estimated: children.reduce((sum, child) => sum + (child.total_tokens_estimated ?? 0), 0)
        };
        nodes.push(node);
        directoryTokensEstimated += node.total_tokens_estimated ?? 0;
      } else if (entry.isFile()) {
        totalFiles++;
        const stats = fs.statSync(fullPath);
        const fileTokens = estimateTokens(fullPath, stats.size);
        const node: FileNode = {
          name: entry.name,
          path: fullPath,
          type: 'file',
          size: stats.size,
          total_tokens_estimated: fileTokens,
        };
        nodes.push(node);
        directoryTokensEstimated += fileTokens;
      }
    }
    return nodes;
  }

  const structure = await traverse(repoPath, 1);
  overallTotalTokensEstimated = structure.reduce((sum, node) => sum + (node.total_tokens_estimated || 0), 0);


  logger.info(`get_repo_map: Generated map for ${repoPath} with ${totalFiles} files and ${overallTotalTokensEstimated} estimated tokens.`);

  return {
    structure,
    total_files: totalFiles,
    total_tokens_estimated: overallTotalTokensEstimated,
  };
}