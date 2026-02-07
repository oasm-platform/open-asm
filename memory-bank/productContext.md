# Product Context

## Why This Project Exists

Open Attack Surface Management (OASM) addresses a critical need in cybersecurity: the ability for organizations to continuously monitor and manage their external attack surface. Traditional security tools often operate in silos, lack real-time visibility, and require significant manual effort to correlate findings.

### Problems Solved

1. **Visibility Gap**: Organizations struggle to maintain an accurate inventory of their internet-facing assets, leading to shadow IT and unmanaged exposure points.

2. **Fragmented Security Tools**: Security teams use multiple disconnected tools, making it difficult to get a unified view of their attack surface and prioritize remediation efforts.

3. **Manual Correlation**: Without automation, correlating vulnerabilities with assets, technologies, and risk levels is time-consuming and error-prone.

4. **Lack of Real-time Monitoring**: Traditional security assessments are point-in-time, missing emerging threats and configuration drift.

5. **Scalability Challenges**: As organizations grow, manually managing security assessments becomes impossible, especially for large, distributed infrastructures.

6. **AI Integration Gap**: While AI assistants are becoming powerful tools for security analysis, they lack direct access to structured asset and vulnerability data.

## How It Should Work

### User Experience Flow

1. **Onboarding & Setup**
   - User creates an account and workspace
   - Configures scan targets (domains, IP ranges)
   - Sets up notification preferences
   - Integrates with existing tools (optional)

2. **Asset Discovery**
   - Automated scanning discovers all internet-facing assets
   - Assets are categorized (domains, subdomains, IPs, services)
   - Technology stack is identified for each asset
   - Assets are grouped logically (by function, environment, etc.)

3. **Continuous Monitoring**
   - Scheduled scans run automatically
   - Real-time alerts for new discoveries or changes
   - Vulnerability detection across the entire attack surface
   - Configuration drift detection

4. **Vulnerability Management**
   - Vulnerabilities are prioritized based on risk scores
   - Detailed remediation guidance provided
   - Tracking of remediation progress
   - Historical view of vulnerability trends

5. **AI-Assisted Analysis**
   - Natural language queries to the attack surface data
   - Automated report generation
   - Risk analysis and recommendations
   - Integration with AI assistants via MCP

6. **Workflow Automation**
   - Configurable scanning schedules
   - Automated alert responses
   - Remediation workflows
   - Integration with ticketing systems

### System Behavior

- **Always On**: Continuous monitoring without manual intervention
- **Scalable**: Handles thousands of assets across multiple workspaces
- **Real-time**: Immediate notifications for critical findings
- **Intelligent**: Prioritizes findings based on actual risk
- **Extensible**: Easy to add new scanning tools and integrations
- **Secure**: All data encrypted, proper access controls
- **Reliable**: Fault-tolerant with automatic retries

### Data Flow

```
Internet Assets → Discovery Workers → Core API → Database
                                                      ↓
                                              Console (UI)
                                                      ↓
                                              AI Assistant (MCP)
                                                      ↓
                                              Insights & Actions
```

## User Experience Goals

### For Security Teams

- **Single Pane of Glass**: One dashboard to see all assets, vulnerabilities, and risks
- **Actionable Insights**: Not just data, but clear guidance on what to fix first
- **Time Savings**: Reduce manual effort by 80%+ through automation
- **Collaboration**: Multi-user support with role-based access
- **Compliance**: Easy reporting for audits and compliance requirements

### For DevOps/Engineering

- **Developer-Friendly**: Clear vulnerability descriptions and remediation steps
- **Integration Ready**: APIs and webhooks for CI/CD pipelines
- **Minimal Overhead**: Low resource consumption, efficient scanning
- **Self-Service**: Easy to set up and configure without dedicated security expertise

### For Management

- **Visibility**: High-level dashboards showing risk posture
- **Metrics**: Quantifiable security metrics and trends
- **ROI**: Clear value demonstration through reduced risk
- **Compliance**: Built-in reporting for common frameworks (SOC2, ISO27001, etc.)

### For AI Assistants

- **Structured Access**: Clean API for querying asset and vulnerability data
- **Natural Language**: MCP integration for conversational queries
- **Context Awareness**: Understanding of asset relationships and risk context
- **Actionable Results**: Ability to generate reports, recommendations, and insights

## Success Metrics

### Technical Metrics
- **Discovery Accuracy**: >95% of assets identified
- **Scan Performance**: <5 minutes for typical asset discovery
- **System Uptime**: >99.9% availability
- **Data Freshness**: Assets updated within 24 hours
- **Vulnerability Detection**: >90% coverage of common vulnerabilities

### Business Metrics
- **Time to Value**: <30 minutes from setup to first scan
- **User Adoption**: >80% of security team members actively using
- **Risk Reduction**: Measurable decrease in critical vulnerabilities over time
- **Automation Rate**: >70% of findings handled automatically

### Security Metrics
- **Mean Time to Detect (MTTD)**: <1 hour for critical exposures
- **Mean Time to Remediate (MTTR)**: <24 hours for high-risk findings
- **False Positive Rate**: <5% for vulnerability detection
- **Coverage**: >95% of known attack vectors monitored

## Future Enhancements

### Near Term (3-6 months)
- Advanced threat intelligence integration
- Custom scanning tool framework
- Enhanced reporting and analytics
- Mobile application
- Integration with popular SIEM/SOAR platforms

### Medium Term (6-12 months)
- Machine learning for anomaly detection
- Predictive risk scoring
- Automated remediation workflows
- Multi-cloud asset discovery
- Compliance automation (SOC2, ISO27001, etc.)

### Long Term (12+ months)
- AI-driven attack path analysis
- Automated penetration testing
- Threat hunting capabilities
- Integration with threat intelligence feeds
- Advanced deception technology

## Competitive Advantages

1. **Open Source**: Transparent, community-driven, no vendor lock-in
2. **Modern Architecture**: Built with latest technologies (NestJS, React 19, Bun)
3. **AI-First**: Native MCP integration for AI assistant support
4. **Distributed**: Scalable architecture for large deployments
5. **Extensible**: Easy to add new tools and integrations
6. **Cost Effective**: Free to use, pay only for infrastructure
7. **Active Community**: Growing contributor base and ecosystem

## Target Users

### Primary Users
- **Security Engineers**: Daily monitoring and remediation
- **Security Analysts**: Threat analysis and incident response
- **DevSecOps Engineers**: Integration with CI/CD pipelines

### Secondary Users
- **System Administrators**: Asset inventory and management
- **Compliance Officers**: Reporting and audit preparation
- **IT Managers**: Risk oversight and budget planning
- **AI Assistants**: Automated analysis and reporting

## Key Differentiators

1. **Unified Platform**: Combines asset discovery, vulnerability management, and monitoring in one tool
2. **AI Integration**: Native MCP support for AI assistant collaboration
3. **Distributed Architecture**: Scales horizontally for enterprise deployments
4. **Open Source**: Community-driven development and transparency
5. **Modern Tech Stack**: Built with current best practices and frameworks
6. **Developer Experience**: Excellent APIs and integration capabilities