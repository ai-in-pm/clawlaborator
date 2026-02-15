import { EnterpriseConfig } from "../config.js";
import { AuditLogger, ComplianceReport } from "../audit.js";
import { EnterpriseAuth, EnterpriseUser } from "../auth.js";

export interface DashboardData {
  overview: {
    totalUsers: number;
    activeUsers: number;
    totalRequests: number;
    averageResponseTime: number;
    systemHealth: 'healthy' | 'warning' | 'critical';
  };
  usage: {
    requestsToday: number;
    requestsThisWeek: number;
    requestsThisMonth: number;
    topUsers: Array<{ userId: string; email: string; requestCount: number }>;
    topChannels: Array<{ channel: string; requestCount: number }>;
  };
  security: {
    failedLogins: number;
    suspiciousActivity: number;
    blockedRequests: number;
    mfaAdoption: number;
  };
  compliance: {
    lastAudit: Date;
    complianceScore: number;
    pendingReviews: number;
    dataRetentionStatus: 'compliant' | 'warning' | 'violation';
  };
}

export class EnterpriseDashboard {
  private config: EnterpriseConfig;
  private auditLogger: AuditLogger;
  private auth: EnterpriseAuth;

  constructor(config: EnterpriseConfig, auditLogger: AuditLogger, auth: EnterpriseAuth) {
    this.config = config;
    this.auditLogger = auditLogger;
    this.auth = auth;
  }

  async getDashboardData(timeRange: '24h' | '7d' | '30d' = '24h'): Promise<DashboardData> {
    const endDate = new Date();
    const startDate = this.getStartDate(timeRange);

    const [overview, usage, security, compliance] = await Promise.all([
      this.getOverviewData(),
      this.getUsageData(startDate, endDate),
      this.getSecurityData(startDate, endDate),
      this.getComplianceData(),
    ]);

    return {
      overview,
      usage,
      security,
      compliance,
    };
  }

  async generateExecutiveSummary(timeRange: '7d' | '30d' | '90d' = '30d'): Promise<ExecutiveSummary> {
    const endDate = new Date();
    const startDate = this.getStartDate(timeRange);

    const events = await this.auditLogger.getEvents({ startDate, endDate });
    const complianceReport = await this.auditLogger.generateComplianceReport(startDate, endDate);

    return {
      period: `${timeRange}`,
      generatedAt: new Date(),
      keyMetrics: {
        totalUsers: complianceReport.uniqueUsers,
        totalRequests: complianceReport.aiRequests,
        securityIncidents: complianceReport.highRiskEvents,
        complianceScore: this.calculateComplianceScore(events),
      },
      insights: await this.generateInsights(events),
      recommendations: await this.generateRecommendations(events, complianceReport),
    };
  }

  private async getOverviewData(): Promise<DashboardData['overview']> {
    // In production, query actual metrics from database
    return {
      totalUsers: 150,
      activeUsers: 89,
      totalRequests: 2847,
      averageResponseTime: 1.2,
      systemHealth: 'healthy',
    };
  }

  private async getUsageData(startDate: Date, endDate: Date): Promise<DashboardData['usage']> {
    const events = await this.auditLogger.getEvents({
      action: 'ai_request' as any,
      startDate,
      endDate,
    });

    // Group by user and channel
    const userCounts = new Map<string, number>();
    const channelCounts = new Map<string, number>();

    events.forEach(event => {
      userCounts.set(event.userId, (userCounts.get(event.userId) || 0) + 1);

      const channel = event.details?.channel || 'unknown';
      channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
    });

    const topUsers = Array.from(userCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([userId, count]) => ({
        userId,
        email: `user${userId}@enterprise.com`, // In production, lookup actual email
        requestCount: count,
      }));

    const topChannels = Array.from(channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([channel, count]) => ({
        channel,
        requestCount: count,
      }));

    return {
      requestsToday: events.filter(e =>
        e.timestamp >= new Date(Date.now() - 24 * 60 * 60 * 1000)
      ).length,
      requestsThisWeek: events.filter(e =>
        e.timestamp >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length,
      requestsThisMonth: events.length,
      topUsers,
      topChannels,
    };
  }

  private async getSecurityData(startDate: Date, endDate: Date): Promise<DashboardData['security']> {
    const events = await this.auditLogger.getEvents({ startDate, endDate });

    return {
      failedLogins: events.filter(e =>
        e.action === 'login' && e.outcome === 'failure'
      ).length,
      suspiciousActivity: events.filter(e => e.riskLevel === 'high').length,
      blockedRequests: events.filter(e =>
        e.action === 'ai_request' && e.outcome === 'failure'
      ).length,
      mfaAdoption: 85, // In production, calculate from user data
    };
  }

  private async getComplianceData(): Promise<DashboardData['compliance']> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const complianceReport = await this.auditLogger.generateComplianceReport(thirtyDaysAgo, new Date());

    return {
      lastAudit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      complianceScore: this.calculateComplianceScore(
        await this.auditLogger.getEvents({ startDate: thirtyDaysAgo, endDate: new Date() })
      ),
      pendingReviews: 3,
      dataRetentionStatus: 'compliant',
    };
  }

  private calculateComplianceScore(events: any[]): number {
    // Simplified compliance scoring
    const totalEvents = events.length;
    const violations = events.filter(e => e.riskLevel === 'high' || e.outcome === 'failure').length;

    if (totalEvents === 0) return 100;

    const score = Math.max(0, 100 - (violations / totalEvents) * 100);
    return Math.round(score);
  }

  private async generateInsights(events: any[]): Promise<string[]> {
    const insights: string[] = [];

    // Usage trends
    const weeklyEvents = this.groupEventsByWeek(events);
    if (weeklyEvents.length >= 2) {
      const growth = ((weeklyEvents[1].count - weeklyEvents[0].count) / weeklyEvents[0].count) * 100;
      if (growth > 10) {
        insights.push(`AI usage has grown by ${Math.round(growth)}% week over week`);
      }
    }

    // Security insights
    const failedLogins = events.filter(e => e.action === 'login' && e.outcome === 'failure');
    if (failedLogins.length > 10) {
      insights.push(`${failedLogins.length} failed login attempts detected - consider additional security measures`);
    }

    // Compliance insights
    const highRiskEvents = events.filter(e => e.riskLevel === 'high');
    if (highRiskEvents.length > 5) {
      insights.push(`${highRiskEvents.length} high-risk events require attention`);
    }

    return insights;
  }

  private async generateRecommendations(events: any[], report: ComplianceReport): Promise<string[]> {
    const recommendations: string[] = [];

    // Security recommendations
    if (report.failedLogins > 20) {
      recommendations.push('Consider implementing account lockout policies after failed attempts');
    }

    // Usage recommendations
    if (report.aiRequests > 1000) {
      recommendations.push('Consider scaling up infrastructure to handle increased AI usage');
    }

    // Compliance recommendations
    if (report.dataExports > 10) {
      recommendations.push('Review data export policies and ensure proper approval workflows');
    }

    return recommendations;
  }

  private groupEventsByWeek(events: any[]): Array<{ week: string; count: number }> {
    const weekGroups = new Map<string, number>();

    events.forEach(event => {
      const week = this.getWeekString(event.timestamp);
      weekGroups.set(week, (weekGroups.get(week) || 0) + 1);
    });

    return Array.from(weekGroups.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  private getWeekString(date: Date): string {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());
    return startOfWeek.toISOString().split('T')[0];
  }

  private getStartDate(timeRange: string): Date {
    const now = new Date();
    switch (timeRange) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}

export interface ExecutiveSummary {
  period: string;
  generatedAt: Date;
  keyMetrics: {
    totalUsers: number;
    totalRequests: number;
    securityIncidents: number;
    complianceScore: number;
  };
  insights: string[];
  recommendations: string[];
}