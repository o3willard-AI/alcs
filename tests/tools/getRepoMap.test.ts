import { get_repo_map } from '../../src/tools/getRepoMap';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../src/services/loggerService';

// Mock the logger to prevent console output during tests
jest.mock('../../src/services/loggerService', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fs module with explicit promises definition and readFileSync
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Keep actual implementations for unmocked methods if needed
  existsSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(), // Mock readFileSync for token estimation
  promises: { // Explicitly mock promises
    readdir: jest.fn(),
  },
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('get_repo_map', () => {
  const mockRepoPath = '/test/repo';
  const TOKEN_CHAR_RATIO = 4; // Should match constant in getRepoMap.ts
  const MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION = 1024 * 1024; // Should match constant in getRepoMap.ts

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Default mock behavior for fs methods
    mockedFs.existsSync.mockReturnValue(true);
    (mockedFs.promises.readdir as jest.Mock).mockClear();
    (mockedFs.statSync as jest.Mock).mockClear();
    (mockedFs.readFileSync as jest.Mock).mockClear();
  });

  it('should throw an error if the repository path does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);
    await expect(get_repo_map({ path: mockRepoPath })).rejects.toThrow('Repository path not found: /test/repo');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Repository path not found'));
  });

  it('should correctly traverse a simple directory structure and estimate tokens', async () => {
    const file1Content = 'file one content'; // 16 chars
    const file2Content = 'file two content is a bit longer'; // 32 chars
    const file1Tokens = Math.ceil(file1Content.length / TOKEN_CHAR_RATIO); // 4
    const file2Tokens = Math.ceil(file2Content.length / TOKEN_CHAR_RATIO); // 8

    mockedFs.promises.readdir.mockImplementation(async (currentPath: fs.PathLike, options?: { withFileTypes?: boolean }) => {
      if (currentPath === mockRepoPath) {
        return [
          { name: 'src', isDirectory: () => true, isFile: () => false },
          { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
        ] as fs.Dirent[];
      }
      if (currentPath === path.join(mockRepoPath, 'src')) {
        return [
          { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        ] as fs.Dirent[];
      }
      return [];
    });
    mockedFs.statSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'file1.ts')) return { size: file1Content.length } as fs.Stats;
      if (filePath === path.join(mockRepoPath, 'src', 'index.ts')) return { size: file2Content.length } as fs.Stats;
      return { size: 0 } as fs.Stats;
    });
    mockedFs.readFileSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'file1.ts')) return file1Content;
      if (filePath === path.join(mockRepoPath, 'src', 'index.ts')) return file2Content;
      return '';
    });


    const result = await get_repo_map({ path: mockRepoPath });

    expect(result.total_files).toBe(2);
    expect(result.total_tokens_estimated).toBe(file1Tokens + file2Tokens); // Total tokens
    expect(result.structure).toEqual([
      expect.objectContaining({
        name: 'src',
        type: 'directory',
        total_tokens_estimated: file2Tokens, // Tokens for index.ts
        children: [
          expect.objectContaining({
            name: 'index.ts',
            type: 'file',
            size: file2Content.length,
            total_tokens_estimated: file2Tokens,
          }),
        ],
      }),
      expect.objectContaining({
        name: 'file1.ts',
        type: 'file',
        size: file1Content.length,
        total_tokens_estimated: file1Tokens,
      }),
    ]);
  });

  it('should respect the depth parameter and aggregate tokens', async () => {
    const fileContent = 'some content'; // 12 chars, 3 tokens
    const fileTokens = Math.ceil(fileContent.length / TOKEN_CHAR_RATIO); // 3

    mockedFs.promises.readdir.mockImplementation(async (currentPath: fs.PathLike, options?: { withFileTypes?: boolean }) => {
      if (currentPath === mockRepoPath) {
        return [
          { name: 'level1', isDirectory: () => true, isFile: () => false },
        ] as fs.Dirent[];
      }
      if (currentPath === path.join(mockRepoPath, 'level1')) {
        return [
          { name: 'level2', isDirectory: () => true, isFile: () => false },
        ] as fs.Dirent[];
      }
      if (currentPath === path.join(mockRepoPath, 'level1', 'level2')) {
        return [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true },
        ] as fs.Dirent[];
      }
      return [];
    });
    mockedFs.statSync.mockReturnValue({ size: fileContent.length } as fs.Stats);
    mockedFs.readFileSync.mockReturnValue(fileContent);


    const result = await get_repo_map({ path: mockRepoPath, depth: 2 }); // Max depth 2

    expect(result.total_files).toBe(0); // file.txt is at depth 3
    expect(result.total_tokens_estimated).toBe(0); // No files included
    expect(result.structure).toEqual([
      expect.objectContaining({
        name: 'level1',
        type: 'directory',
        total_tokens_estimated: 0, // Children not included beyond depth
        children: [
          expect.objectContaining({
            name: 'level2',
            type: 'directory',
            total_tokens_estimated: 0,
            children: [], // Children should not be traversed beyond depth 2
          }),
        ],
      }),
    ]);
  });

  it('should exclude test files by default and estimate tokens', async () => {
    const appContent = 'app content'; // 11 chars, 3 tokens
    const testContent = 'test content'; // 12 chars, 3 tokens
    const appTokens = Math.ceil(appContent.length / TOKEN_CHAR_RATIO); // 3

    mockedFs.promises.readdir.mockImplementation(async (currentPath: fs.PathLike, options?: { withFileTypes?: boolean }) => {
      if (currentPath === mockRepoPath) {
        return [
          { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          { name: 'app.test.ts', isDirectory: () => false, isFile: () => true },
        ] as fs.Dirent[];
      }
      return [];
    });
    mockedFs.statSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'app.ts')) return { size: appContent.length } as fs.Stats;
      if (filePath === path.join(mockRepoPath, 'app.test.ts')) return { size: testContent.length } as fs.Stats;
      return { size: 0 } as fs.Stats;
    });
    mockedFs.readFileSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'app.ts')) return appContent;
      if (filePath === path.join(mockRepoPath, 'app.test.ts')) return testContent;
      return '';
    });

    const result = await get_repo_map({ path: mockRepoPath }); // include_tests defaults to false

    expect(result.total_files).toBe(1);
    expect(result.total_tokens_estimated).toBe(appTokens);
    expect(result.structure).toEqual([
      expect.objectContaining({
        name: 'app.ts',
        type: 'file',
        size: appContent.length,
        total_tokens_estimated: appTokens,
      }),
    ]);
  });

  it('should include test files when include_tests is true and estimate tokens', async () => {
    const appContent = 'app content'; // 11 chars, 3 tokens
    const testContent = 'test content'; // 12 chars, 3 tokens
    const appTokens = Math.ceil(appContent.length / TOKEN_CHAR_RATIO); // 3
    const testTokens = Math.ceil(testContent.length / TOKEN_CHAR_RATIO); // 3

    mockedFs.promises.readdir.mockImplementation(async (currentPath: fs.PathLike, options?: { withFileTypes?: boolean }) => {
      if (currentPath === mockRepoPath) {
        return [
          { name: 'app.ts', isDirectory: () => false, isFile: () => true },
          { name: 'app.test.ts', isDirectory: () => false, isFile: () => true },
        ] as fs.Dirent[];
      }
      return [];
    });
    mockedFs.statSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'app.ts')) return { size: appContent.length } as fs.Stats;
      if (filePath === path.join(mockRepoPath, 'app.test.ts')) return { size: testContent.length } as fs.Stats;
      return { size: 0 } as fs.Stats;
    });
    mockedFs.readFileSync.mockImplementation((filePath: fs.PathLike) => {
      if (filePath === path.join(mockRepoPath, 'app.ts')) return appContent;
      if (filePath === path.join(mockRepoPath, 'app.test.ts')) return testContent;
      return '';
    });

    const result = await get_repo_map({ path: mockRepoPath, include_tests: true });

    expect(result.total_files).toBe(2);
    expect(result.total_tokens_estimated).toBe(appTokens + testTokens);
    expect(result.structure).toEqual([
      expect.objectContaining({ name: 'app.ts', total_tokens_estimated: appTokens }),
      expect.objectContaining({ name: 'app.test.ts', total_tokens_estimated: testTokens }),
    ]);
  });

  it('should handle large files for token estimation', async () => {
    const largeContent = 'a'.repeat(MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION + 100); // Larger than max size
    const expectedTokensForLargeFile = MAX_FILE_SIZE_FOR_TOKEN_ESTIMATION / TOKEN_CHAR_RATIO;

    mockedFs.promises.readdir.mockImplementation(async (currentPath: fs.PathLike) => {
      if (currentPath === mockRepoPath) {
        return [{ name: 'large.txt', isDirectory: () => false, isFile: () => true }] as fs.Dirent[];
      }
      return [];
    });
    mockedFs.statSync.mockReturnValue({ size: largeContent.length } as fs.Stats);
    mockedFs.readFileSync.mockReturnValue(largeContent); // Still mock content, but it shouldn't be fully read

    const result = await get_repo_map({ path: mockRepoPath });

    expect(result.total_files).toBe(1);
    expect(result.total_tokens_estimated).toBe(expectedTokensForLargeFile);
    expect(result.structure[0]).toEqual(expect.objectContaining({
      name: 'large.txt',
      type: 'file',
      size: largeContent.length,
      total_tokens_estimated: expectedTokensForLargeFile,
    }));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Skipping token estimation for large file:'));
  });
});
