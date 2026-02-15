export { EnterpriseConfig, EnterpriseConfigSchema, defaultEnterpriseConfig } from './config.js';
export {
  EnterpriseAuth,
  EnterpriseUser,
  UserRole,
  Permission,
  AuthToken,
  MFAChallenge
} from './auth.js';
export {
  AuditLogger,
  AuditEvent,
  AuditAction,
  ComplianceManager,
  ComplianceStatus,
  ComplianceReport
} from './audit.js';
export {
  EnterpriseContentFilter,
  ContentPolicy,
  ContentRule,
  FilterResult,
  PolicyViolation
} from './content-filter.js';
export {
  EnterpriseDashboard,
  DashboardData,
  ExecutiveSummary
} from './ui/dashboard.js';

import { EnterpriseConfig, defaultEnterpriseConfig } from './config.js';
import { EnterpriseAuth } from './auth.js';
import { AuditLogger, ComplianceManager } from './audit.js';
import { EnterpriseContentFilter } from './content-filter.js';
import { EnterpriseDashboard } from './ui/dashboard.js';

export class EnterpriseAssistant {
  private config: EnterpriseConfig;
  private auth: EnterpriseAuth;
  private auditLogger: AuditLogger;
  private contentFilter: EnterpriseContentFilter;
  private complianceManager: ComplianceManager;
  private dashboard: EnterpriseDashboard;

  constructor(config?: Partial<EnterpriseConfig>) {
    this.config = { ...defaultEnterpriseConfig, ...config };

    this.auditLogger = new AuditLogger(this.config);
    this.auth = new EnterpriseAuth();
    this.contentFilter = new EnterpriseContentFilter(this.config, this.auditLogger);
    this.complianceManager = new ComplianceManager(this.auditLogger, this.config);
    this.dashboard = new EnterpriseDashboard(this.config, this.auditLogger, this.auth);
  }

  getConfig(): EnterpriseConfig {
    return this.config;
  }

  getAuth(): EnterpriseAuth {
    return this.auth;
  }

  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  getContentFilter(): EnterpriseContentFilter {
    return this.contentFilter;
  }

  getComplianceManager(): ComplianceManager {
    return this.complianceManager;
  }

  getDashboard(): EnterpriseDashboard {
    return this.dashboard;
  }

  async initialize(): Promise<void> {
    // Initialize enterprise components
    console.log(`Initializing ${this.config.organization.name} Enterprise AI Assistant`);

    // Create default admin user if none exists
    const adminUserId = await this.auth.createUser({
      email: this.config.organization.adminEmail,
      name: 'System Administrator',
      department: 'IT',
      role: UserRole.ADMIN,
      permissions: Object.values(Permission),
      mfaEnabled: this.config.security.requireMFA,
      isActive: true,
    });

    console.log(`Enterprise AI Assistant initialized with admin user: ${adminUserId}`);
  }

  async processRequest(userId: string, content: string, channel: string): Promise<{
    response: string;
    filtered: boolean;
    blocked: boolean;
  }> {
    // 1. Authenticate and authorize user
    const user = await this.validateUserSession(userId);
    if (!user) {
      throw new Error('Unauthorized access');
    }

    // 2. Check channel permissions
    if (!this.config.security.allowedChannels.includes(channel as any)) {
      throw new Error(`Channel ${channel} is not allowed for enterprise use`);
    }

    // 3. Filter content
    const filterResult = await this.contentFilter.filterContent(content, userId, channel);

    if (!filterResult.allowed) {
      return {
        response: 'Your request has been blocked due to policy violations. Please contact your administrator for assistance.',
        filtered: true,
        blocked: true,
      };
    }

    // 4. Process the AI request (integration with existing OpenClaw logic would go here)
    const processedContent = filterResult.modifiedContent || content;
    const response = await this.processAIRequest(processedContent, user);

    // 5. Filter response
    const responseFilter = await this.contentFilter.filterContent(response, userId, `${channel}-response`);

    return {
      response: responseFilter.modifiedContent || response,
      filtered: filterResult.violations.length > 0 || responseFilter.violations.length > 0,
      blocked: false,
    };
  }

  private async validateUserSession(userId: string): Promise<EnterpriseUser | null> {
    // In production, validate actual session token
    return null; // Simplified for demo
  }

  private async processAIRequest(content: string, user: EnterpriseUser): Promise<string> {
    // This would integrate with the existing OpenClaw AI processing pipeline
    // For demo purposes, return a simple response
    return `Enterprise AI Assistant response for ${user.name}: Your request has been processed according to ${this.config.organization.name} policies.`;
  }
}

// Re-export enums for convenience
export { UserRole, Permission } from './auth.js';
export { AuditAction } from './audit.js';