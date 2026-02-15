import { z } from "zod";

export const EnterpriseConfigSchema = z.object({
  organization: z.object({
    name: z.string().min(1),
    domain: z.string().min(1),
    adminEmail: z.string().email(),
    supportContact: z.string().email(),
  }),
  security: z.object({
    allowedDomains: z.array(z.string()).default([]),
    requireMFA: z.boolean().default(true),
    sessionTimeout: z.number().default(3600), // seconds
    maxFailedAttempts: z.number().default(3),
    passwordPolicy: z.object({
      minLength: z.number().default(12),
      requireUppercase: z.boolean().default(true),
      requireLowercase: z.boolean().default(true),
      requireNumbers: z.boolean().default(true),
      requireSpecialChars: z.boolean().default(true),
    }),
    allowedChannels: z.array(z.enum(['slack', 'teams', 'email', 'webchat'])).default(['slack', 'teams', 'webchat']),
    dataRetention: z.object({
      conversationDays: z.number().default(90),
      logDays: z.number().default(365),
      auditDays: z.number().default(2555), // 7 years
    }),
  }),
  ai: z.object({
    allowedModels: z.array(z.string()).default(['claude-3-sonnet', 'gpt-4']),
    maxTokensPerRequest: z.number().default(4000),
    maxRequestsPerHour: z.number().default(100),
    contentFiltering: z.boolean().default(true),
    loggingEnabled: z.boolean().default(true),
  }),
  compliance: z.object({
    gdprEnabled: z.boolean().default(true),
    hipaaMode: z.boolean().default(false),
    soxCompliance: z.boolean().default(false),
    dataResidency: z.enum(['us', 'eu', 'global']).default('us'),
  }),
  deployment: z.object({
    environment: z.enum(['development', 'staging', 'production']).default('production'),
    loadBalancing: z.boolean().default(true),
    highAvailability: z.boolean().default(true),
    backupStrategy: z.enum(['daily', 'hourly', 'realtime']).default('daily'),
  }),
});

export type EnterpriseConfig = z.infer<typeof EnterpriseConfigSchema>;

export const defaultEnterpriseConfig: EnterpriseConfig = {
  organization: {
    name: "Enterprise Corp",
    domain: "enterprise.com",
    adminEmail: "admin@enterprise.com",
    supportContact: "support@enterprise.com",
  },
  security: {
    allowedDomains: [],
    requireMFA: true,
    sessionTimeout: 3600,
    maxFailedAttempts: 3,
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
    },
    allowedChannels: ['slack', 'teams', 'webchat'],
    dataRetention: {
      conversationDays: 90,
      logDays: 365,
      auditDays: 2555,
    },
  },
  ai: {
    allowedModels: ['claude-3-sonnet', 'gpt-4'],
    maxTokensPerRequest: 4000,
    maxRequestsPerHour: 100,
    contentFiltering: true,
    loggingEnabled: true,
  },
  compliance: {
    gdprEnabled: true,
    hipaaMode: false,
    soxCompliance: false,
    dataResidency: 'us',
  },
  deployment: {
    environment: 'production',
    loadBalancing: true,
    highAvailability: true,
    backupStrategy: 'daily',
  },
};