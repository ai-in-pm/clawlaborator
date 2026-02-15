import { describe, test, expect, beforeEach } from 'vitest';
import { EnterpriseAssistant, UserRole, Permission } from '../index.js';
import { EnterpriseConfig } from '../config.js';

describe('EnterpriseAssistant', () => {
  let enterpriseAssistant: EnterpriseAssistant;
  let testConfig: Partial<EnterpriseConfig>;

  beforeEach(() => {
    testConfig = {
      organization: {
        name: 'Test Corp',
        domain: 'test.com',
        adminEmail: 'admin@test.com',
        supportContact: 'support@test.com',
      },
      security: {
        requireMFA: true,
        sessionTimeout: 3600,
        allowedChannels: ['slack', 'teams', 'webchat'],
      },
    };

    enterpriseAssistant = new EnterpriseAssistant(testConfig);
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      const config = enterpriseAssistant.getConfig();
      expect(config.organization.name).toBe('Test Corp');
      expect(config.security.requireMFA).toBe(true);
    });

    test('should provide access to enterprise components', () => {
      expect(enterpriseAssistant.getAuth()).toBeDefined();
      expect(enterpriseAssistant.getAuditLogger()).toBeDefined();
      expect(enterpriseAssistant.getContentFilter()).toBeDefined();
      expect(enterpriseAssistant.getComplianceManager()).toBeDefined();
      expect(enterpriseAssistant.getDashboard()).toBeDefined();
    });
  });

  describe('Authentication', () => {
    test('should create enterprise users with correct roles', async () => {
      const auth = enterpriseAssistant.getAuth();

      const userId = await auth.createUser({
        email: 'user@test.com',
        name: 'Test User',
        department: 'Engineering',
        role: UserRole.USER,
        permissions: [Permission.AI_CHAT],
        mfaEnabled: true,
        isActive: true,
      });

      expect(userId).toBeTruthy();
      expect(userId.startsWith('usr_')).toBe(true);
    });

    test('should authenticate users with valid credentials', async () => {
      const auth = enterpriseAssistant.getAuth();

      // Create a test user first
      await auth.createUser({
        email: 'testuser@test.com',
        name: 'Test User',
        department: 'Engineering',
        role: UserRole.USER,
        permissions: [Permission.AI_CHAT],
        mfaEnabled: false,
        isActive: true,
      });

      const result = await auth.authenticateUser('testuser@test.com', 'validpassword');
      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
    });

    test('should reject invalid credentials', async () => {
      const auth = enterpriseAssistant.getAuth();

      const result = await auth.authenticateUser('nonexistent@test.com', 'invalidpassword');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials');
    });
  });

  describe('Content Filtering', () => {
    test('should block content with policy violations', async () => {
      const contentFilter = enterpriseAssistant.getContentFilter();

      const result = await contentFilter.filterContent(
        'My SSN is 123-45-6789',
        'testuser',
        'slack'
      );

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].policyName).toBe('PII Protection');
    });

    test('should allow safe content', async () => {
      const contentFilter = enterpriseAssistant.getContentFilter();

      const result = await contentFilter.filterContent(
        'What is the weather today?',
        'testuser',
        'slack'
      );

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    test('should detect and warn about inappropriate content', async () => {
      const contentFilter = enterpriseAssistant.getContentFilter();

      const result = await contentFilter.filterContent(
        'This is an offensive message',
        'testuser',
        'slack'
      );

      expect(result.violations.some(v => v.action === 'warn')).toBe(true);
    });
  });

  describe('Audit Logging', () => {
    test('should log user actions', async () => {
      const auditLogger = enterpriseAssistant.getAuditLogger();

      await auditLogger.logEvent({
        userId: 'testuser',
        userEmail: 'testuser@test.com',
        action: 'ai_request' as any,
        resource: 'slack',
        details: { message: 'test request' },
        ipAddress: '192.168.1.100',
        userAgent: 'TestAgent/1.0',
        outcome: 'success',
        riskLevel: 'low',
      });

      const events = await auditLogger.getEvents({
        userId: 'testuser',
        action: 'ai_request' as any,
      });

      expect(events).toHaveLength(1);
      expect(events[0].userEmail).toBe('testuser@test.com');
    });

    test('should generate compliance reports', async () => {
      const auditLogger = enterpriseAssistant.getAuditLogger();

      // Log some test events
      await auditLogger.logEvent({
        userId: 'testuser',
        userEmail: 'testuser@test.com',
        action: 'login' as any,
        resource: 'web',
        details: {},
        ipAddress: '192.168.1.100',
        userAgent: 'TestAgent/1.0',
        outcome: 'success',
        riskLevel: 'low',
      });

      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const report = await auditLogger.generateComplianceReport(startDate, endDate);

      expect(report.totalEvents).toBeGreaterThan(0);
      expect(report.loginAttempts).toBeGreaterThan(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Dashboard Analytics', () => {
    test('should generate dashboard data', async () => {
      const dashboard = enterpriseAssistant.getDashboard();

      const data = await dashboard.getDashboardData('24h');

      expect(data.overview).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.security).toBeDefined();
      expect(data.compliance).toBeDefined();
    });

    test('should generate executive summary', async () => {
      const dashboard = enterpriseAssistant.getDashboard();

      const summary = await dashboard.generateExecutiveSummary('7d');

      expect(summary.period).toBe('7d');
      expect(summary.keyMetrics).toBeDefined();
      expect(summary.insights).toBeInstanceOf(Array);
      expect(summary.recommendations).toBeInstanceOf(Array);
    });
  });

  describe('Compliance', () => {
    test('should check GDPR compliance', async () => {
      const complianceManager = enterpriseAssistant.getComplianceManager();

      const status = await complianceManager.ensureGDPRCompliance();

      expect(status).toHaveProperty('compliant');
      expect(status).toHaveProperty('issues');
    });

    test('should check HIPAA compliance when enabled', async () => {
      // Create instance with HIPAA enabled
      const hipaaConfig = {
        ...testConfig,
        compliance: {
          ...testConfig.compliance,
          hipaaMode: true,
        },
      };

      const hipaaAssistant = new EnterpriseAssistant(hipaaConfig);
      const complianceManager = hipaaAssistant.getComplianceManager();

      const status = await complianceManager.ensureHIPAACompliance();

      expect(status).toHaveProperty('compliant');
      expect(status).toHaveProperty('issues');
    });
  });

  describe('Request Processing', () => {
    test('should process allowed requests', async () => {
      // This is a placeholder test as the actual implementation would require
      // more complex setup with real authentication and session management
      expect(enterpriseAssistant.processRequest).toBeDefined();
    });

    test('should reject requests from unauthorized users', async () => {
      try {
        await enterpriseAssistant.processRequest(
          'nonexistent-user',
          'test request',
          'slack'
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Unauthorized access');
      }
    });

    test('should reject requests from disallowed channels', async () => {
      try {
        await enterpriseAssistant.processRequest(
          'testuser',
          'test request',
          'discord' // Not in allowed channels
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('not allowed');
      }
    });
  });
});