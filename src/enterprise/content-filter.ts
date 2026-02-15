import { EnterpriseConfig } from "./config.js";
import { AuditLogger, AuditAction } from "./audit.js";

export interface ContentPolicy {
  id: string;
  name: string;
  description: string;
  rules: ContentRule[];
  enabled: boolean;
  severity: 'low' | 'medium' | 'high';
  action: 'warn' | 'block' | 'quarantine';
}

export interface ContentRule {
  type: 'keyword' | 'pattern' | 'category' | 'sentiment';
  value: string | string[];
  confidence?: number;
  caseSensitive?: boolean;
}

export interface FilterResult {
  allowed: boolean;
  violations: PolicyViolation[];
  modifiedContent?: string;
  confidence: number;
}

export interface PolicyViolation {
  policyId: string;
  policyName: string;
  rule: ContentRule;
  matchedText: string;
  severity: 'low' | 'medium' | 'high';
  action: 'warn' | 'block' | 'quarantine';
}

export class EnterpriseContentFilter {
  private policies: Map<string, ContentPolicy> = new Map();
  private config: EnterpriseConfig;
  private auditLogger: AuditLogger;

  constructor(config: EnterpriseConfig, auditLogger: AuditLogger) {
    this.config = config;
    this.auditLogger = auditLogger;
    this.initializeDefaultPolicies();
  }

  async filterContent(content: string, userId: string, context: string): Promise<FilterResult> {
    const violations: PolicyViolation[] = [];
    let modifiedContent = content;
    let maxConfidence = 0;

    for (const policy of this.policies.values()) {
      if (!policy.enabled) continue;

      const policyViolations = await this.checkPolicy(content, policy);
      violations.push(...policyViolations);

      if (policyViolations.length > 0) {
        maxConfidence = Math.max(maxConfidence, 0.9); // High confidence for policy violations

        // Apply content modifications based on policy action
        if (policy.action === 'block') {
          modifiedContent = '[CONTENT BLOCKED BY POLICY]';
        } else if (policy.action === 'quarantine') {
          modifiedContent = '[CONTENT UNDER REVIEW]';
        }
      }
    }

    const allowed = !violations.some(v => v.action === 'block');

    // Log content filtering event
    await this.auditLogger.logEvent({
      userId,
      userEmail: await this.getUserEmail(userId),
      action: AuditAction.AI_REQUEST,
      resource: context,
      details: {
        contentLength: content.length,
        violations: violations.length,
        blocked: !allowed,
        policies: violations.map(v => v.policyId),
      },
      ipAddress: '0.0.0.0', // Should be passed from request context
      userAgent: 'Enterprise AI Assistant',
      outcome: allowed ? 'success' : 'failure',
      riskLevel: violations.some(v => v.severity === 'high') ? 'high' : 'low',
    });

    return {
      allowed,
      violations,
      modifiedContent: modifiedContent !== content ? modifiedContent : undefined,
      confidence: maxConfidence,
    };
  }

  async addPolicy(policy: Omit<ContentPolicy, 'id'>): Promise<string> {
    const id = this.generatePolicyId();
    const newPolicy: ContentPolicy = {
      ...policy,
      id,
    };

    this.policies.set(id, newPolicy);
    return id;
  }

  async updatePolicy(id: string, updates: Partial<ContentPolicy>): Promise<boolean> {
    const policy = this.policies.get(id);
    if (!policy) return false;

    const updatedPolicy = { ...policy, ...updates };
    this.policies.set(id, updatedPolicy);
    return true;
  }

  async deletePolicy(id: string): Promise<boolean> {
    return this.policies.delete(id);
  }

  getPolicies(): ContentPolicy[] {
    return Array.from(this.policies.values());
  }

  private async checkPolicy(content: string, policy: ContentPolicy): Promise<PolicyViolation[]> {
    const violations: PolicyViolation[] = [];

    for (const rule of policy.rules) {
      const matches = await this.checkRule(content, rule);

      for (const match of matches) {
        violations.push({
          policyId: policy.id,
          policyName: policy.name,
          rule,
          matchedText: match,
          severity: policy.severity,
          action: policy.action,
        });
      }
    }

    return violations;
  }

  private async checkRule(content: string, rule: ContentRule): Promise<string[]> {
    const matches: string[] = [];

    switch (rule.type) {
      case 'keyword':
        const keywords = Array.isArray(rule.value) ? rule.value : [rule.value];
        for (const keyword of keywords) {
          const regex = new RegExp(
            keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            rule.caseSensitive ? 'g' : 'gi'
          );
          const found = content.match(regex);
          if (found) matches.push(...found);
        }
        break;

      case 'pattern':
        const pattern = Array.isArray(rule.value) ? rule.value[0] : rule.value;
        const regex = new RegExp(pattern, rule.caseSensitive ? 'g' : 'gi');
        const found = content.match(regex);
        if (found) matches.push(...found);
        break;

      case 'category':
        // In production, use ML models for content categorization
        if (await this.detectCategory(content, rule.value)) {
          matches.push(content.substring(0, 50) + '...');
        }
        break;

      case 'sentiment':
        // In production, use sentiment analysis models
        const sentiment = await this.analyzeSentiment(content);
        if (sentiment.matches(rule.value)) {
          matches.push(`Sentiment: ${sentiment}`);
        }
        break;
    }

    return matches;
  }

  private async detectCategory(content: string, category: string | string[]): Promise<boolean> {
    // Simplified category detection - in production use ML models
    const categories = Array.isArray(category) ? category : [category];
    const lowerContent = content.toLowerCase();

    const categoryKeywords = {
      'financial': ['bank', 'credit card', 'ssn', 'social security', 'account number'],
      'medical': ['patient', 'medical', 'health', 'diagnosis', 'prescription'],
      'personal': ['address', 'phone', 'email', 'birthday', 'personal'],
      'confidential': ['confidential', 'secret', 'internal', 'proprietary'],
    };

    for (const cat of categories) {
      const keywords = categoryKeywords[cat as keyof typeof categoryKeywords] || [];
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return true;
      }
    }

    return false;
  }

  private async analyzeSentiment(content: string): Promise<string> {
    // Simplified sentiment analysis - in production use ML models
    const negativeWords = ['hate', 'angry', 'terrible', 'awful', 'horrible'];
    const lowerContent = content.toLowerCase();

    if (negativeWords.some(word => lowerContent.includes(word))) {
      return 'negative';
    }

    return 'neutral';
  }

  private initializeDefaultPolicies(): void {
    // PII Protection Policy
    this.policies.set('pii-protection', {
      id: 'pii-protection',
      name: 'PII Protection',
      description: 'Detects and blocks personally identifiable information',
      enabled: true,
      severity: 'high',
      action: 'block',
      rules: [
        {
          type: 'pattern',
          value: '\\b\\d{3}-\\d{2}-\\d{4}\\b', // SSN pattern
        },
        {
          type: 'pattern',
          value: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b', // Credit card pattern
        },
        {
          type: 'category',
          value: ['financial', 'medical'],
        },
      ],
    });

    // Inappropriate Content Policy
    this.policies.set('inappropriate-content', {
      id: 'inappropriate-content',
      name: 'Inappropriate Content',
      description: 'Blocks inappropriate or offensive content',
      enabled: true,
      severity: 'medium',
      action: 'warn',
      rules: [
        {
          type: 'keyword',
          value: ['offensive', 'inappropriate'], // Add more as needed
          caseSensitive: false,
        },
        {
          type: 'sentiment',
          value: 'negative',
        },
      ],
    });

    // Confidential Information Policy
    this.policies.set('confidential-info', {
      id: 'confidential-info',
      name: 'Confidential Information',
      description: 'Protects confidential business information',
      enabled: true,
      severity: 'high',
      action: 'quarantine',
      rules: [
        {
          type: 'category',
          value: 'confidential',
        },
        {
          type: 'keyword',
          value: ['internal use only', 'confidential', 'trade secret'],
          caseSensitive: false,
        },
      ],
    });
  }

  private generatePolicyId(): string {
    return 'policy_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }

  private async getUserEmail(userId: string): Promise<string> {
    // In production, look up user email from user service
    return `user${userId}@enterprise.com`;
  }
}