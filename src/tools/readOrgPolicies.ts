import fs from 'fs';
import path from 'path';
import { PolicyType, PolicyRule, ReadOrgPoliciesParams, ReadOrgPoliciesResponse } from '../types/mcp';
import { logger } from '../services/loggerService';
import { configManager } from '../services/configService';

// Default OWASP Top 10 policies (simplified example)
const OWASP_TOP_10_POLICIES: PolicyRule[] = [
  { id: 'OWASP-A01', description: 'Broken Access Control', severity: 'high', category: 'Security' },
  { id: 'OWASP-A02', description: 'Cryptographic Failures', severity: 'high', category: 'Security' },
  { id: 'OWASP-A03', description: 'Injection', severity: 'critical', category: 'Security' },
  { id: 'OWASP-A07', description: 'Identification and Authentication Failures', severity: 'high', category: 'Security' },
  { id: 'OWASP-A09', description: 'Security Logging and Monitoring Failures', severity: 'medium', category: 'Security' },
];

/**
 * Reads organizational policies from a file or returns a default baseline.
 */
export async function read_org_policies(params: ReadOrgPoliciesParams): Promise<ReadOrgPoliciesResponse> {
  const { policy_type } = params;
  const policyFilePath = path.join(configManager.config.policies_path, `${policy_type}-policies.json`);

  // Check for custom policy file
  if (fs.existsSync(policyFilePath)) {
    try {
      const rawData = await fs.promises.readFile(policyFilePath, 'utf-8');
      const rules: PolicyRule[] = JSON.parse(rawData);
      logger.info(`read_org_policies: Loaded ${policy_type} policies from ${policyFilePath}`);
      return {
        policy_type,
        rules,
        source: 'file',
      };
    } catch (error: any) {
      logger.error(`read_org_policies: Failed to read or parse policy file ${policyFilePath}. Error: ${error.message}`);
      // Fallback to default if file parsing fails, or return error depending on requirements
    }
  }

  // If no file, or parsing failed, return default policies
  // For 'security' type, we provide a simplified OWASP baseline
  if (policy_type === 'security') {
    logger.info(`read_org_policies: Returning default OWASP Top 10 security policies.`);
    return {
      policy_type,
      rules: OWASP_TOP_10_POLICIES,
      source: 'default',
    };
  }

  logger.warn(`read_org_policies: No custom policy file found for ${policy_type} and no default defined besides security.`);
  return {
    policy_type,
    rules: [],
    source: 'default',
  };
}
