import { EnterpriseConfig } from "./config.js";

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  userEmail: string;
  action: AuditAction;
  resource: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  outcome: 'success' | 'failure';
  riskLevel: 'low' | 'medium' | 'high';
}

export enum AuditAction {
  LOGIN = 'login',
  LOGOUT = 'logout',
  MFA_CHALLENGE = 'mfa_challenge',
  MFA_VERIFY = 'mfa_verify',
  AI_REQUEST = 'ai_request',
  DATA_EXPORT = 'data_export',
  CONFIG_CHANGE = 'config_change',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  PERMISSION_CHANGE = 'permission_change',
  CHANNEL_ACCESS = 'channel_access',
  FILE_UPLOAD = 'file_upload',
  DATA_ACCESS = 'data_access',
}

export class AuditLogger {
  private events: AuditEvent[] = [];
  private config: EnterpriseConfig;

  constructor(config: EnterpriseConfig) {
    this.config = config;
  }

  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date(),
    };

    this.events.push(auditEvent);

    // In production, you would persist to a secure database
    await this.persistEvent(auditEvent);

    // Alert on high-risk events
    if (auditEvent.riskLevel === 'high') {
      await this.alertSecurity(auditEvent);
    }
  }

  async getEvents(filters: {
    userId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    riskLevel?: 'low' | 'medium' | 'high';
    outcome?: 'success' | 'failure';
  }): Promise<AuditEvent[]> {
    return this.events.filter(event => {
      if (filters.userId && event.userId !== filters.userId) return false;
      if (filters.action && event.action !== filters.action) return false;
      if (filters.startDate && event.timestamp < filters.startDate) return false;
      if (filters.endDate && event.timestamp > filters.endDate) return false;
      if (filters.riskLevel && event.riskLevel !== filters.riskLevel) return false;
      if (filters.outcome && event.outcome !== filters.outcome) return false;
      return true;
    });
  }

  async generateComplianceReport(startDate: Date, endDate: Date): Promise<ComplianceReport> {
    const events = await this.getEvents({ startDate, endDate });

    return {
      period: { startDate, endDate },
      totalEvents: events.length,
      loginAttempts: events.filter(e => e.action === AuditAction.LOGIN).length,
      failedLogins: events.filter(e => e.action === AuditAction.LOGIN && e.outcome === 'failure').length,
      aiRequests: events.filter(e => e.action === AuditAction.AI_REQUEST).length,
      dataExports: events.filter(e => e.action === AuditAction.DATA_EXPORT).length,
      configChanges: events.filter(e => e.action === AuditAction.CONFIG_CHANGE).length,
      highRiskEvents: events.filter(e => e.riskLevel === 'high').length,
      uniqueUsers: new Set(events.map(e => e.userId)).size,
      generatedAt: new Date(),
    };
  }

  async exportAuditLogs(startDate: Date, endDate: Date, format: 'json' | 'csv'): Promise<string> {
    const events = await this.getEvents({ startDate, endDate });

    if (format === 'csv') {
      return this.exportToCSV(events);
    }

    return JSON.stringify(events, null, 2);
  }

  private async persistEvent(event: AuditEvent): Promise<void> {
    // In production, persist to secure database with encryption
    // Consider using immutable storage like blockchain or write-only databases
    console.log(`[AUDIT] ${event.action} by ${event.userEmail} - ${event.outcome}`);
  }

  private async alertSecurity(event: AuditEvent): Promise<void> {
    // In production, send alerts to security team
    console.log(`[SECURITY ALERT] High-risk event: ${event.action} by ${event.userEmail}`);
  }

  private exportToCSV(events: AuditEvent[]): string {
    const headers = ['ID', 'Timestamp', 'User Email', 'Action', 'Resource', 'Outcome', 'Risk Level', 'IP Address'];
    const rows = events.map(event => [
      event.id,
      event.timestamp.toISOString(),
      event.userEmail,
      event.action,
      event.resource,
      event.outcome,
      event.riskLevel,
      event.ipAddress,
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  private generateEventId(): string {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  }
}

export interface ComplianceReport {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totalEvents: number;
  loginAttempts: number;
  failedLogins: number;
  aiRequests: number;
  dataExports: number;
  configChanges: number;
  highRiskEvents: number;
  uniqueUsers: number;
  generatedAt: Date;
}

export class ComplianceManager {
  private auditLogger: AuditLogger;
  private config: EnterpriseConfig;

  constructor(auditLogger: AuditLogger, config: EnterpriseConfig) {
    this.auditLogger = auditLogger;
    this.config = config;
  }

  async ensureGDPRCompliance(): Promise<ComplianceStatus> {
    if (!this.config.compliance.gdprEnabled) {
      return { compliant: false, issues: ['GDPR not enabled in configuration'] };
    }

    const issues: string[] = [];

    // Check data retention policies
    const oldConversations = await this.findExpiredConversations();
    if (oldConversations.length > 0) {
      issues.push(`${oldConversations.length} conversations exceed retention period`);
    }

    // Check user consent tracking
    const usersWithoutConsent = await this.findUsersWithoutConsent();
    if (usersWithoutConsent.length > 0) {
      issues.push(`${usersWithoutConsent.length} users missing consent records`);
    }

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  async ensureHIPAACompliance(): Promise<ComplianceStatus> {
    if (!this.config.compliance.hipaaMode) {
      return { compliant: true, issues: [] }; // Not required
    }

    const issues: string[] = [];

    // Check encryption requirements
    if (!this.isEncryptionEnabled()) {
      issues.push('End-to-end encryption not enabled');
    }

    // Check access controls
    if (!this.areAccessControlsStrict()) {
      issues.push('Insufficient access controls for PHI');
    }

    return {
      compliant: issues.length === 0,
      issues,
    };
  }

  private async findExpiredConversations(): Promise<string[]> {
    // In production, query database for conversations older than retention period
    return [];
  }

  private async findUsersWithoutConsent(): Promise<string[]> {
    // In production, query database for users without valid consent
    return [];
  }

  private isEncryptionEnabled(): boolean {
    // Check if all data is encrypted at rest and in transit
    return true; // Simplified for demo
  }

  private areAccessControlsStrict(): boolean {
    // Verify strict access controls for healthcare data
    return this.config.security.requireMFA && this.config.security.allowedChannels.length <= 2;
  }
}

export interface ComplianceStatus {
  compliant: boolean;
  issues: string[];
}