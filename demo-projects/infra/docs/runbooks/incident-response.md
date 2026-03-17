# Incident Response Runbook

## Overview

This runbook defines the incident management process for ShopFlow. All on-call
engineers must be familiar with this document. Incidents are classified by severity,
each with defined response times, escalation paths, and communication requirements.

## Severity Levels

| Severity | Definition                                          | Response Time | Update Cadence | Example                              |
|----------|-----------------------------------------------------|---------------|----------------|--------------------------------------|
| SEV-1    | Complete service outage or data loss                | 5 minutes     | Every 15 min   | All API endpoints returning 503      |
| SEV-2    | Major feature degraded, significant user impact     | 15 minutes    | Every 30 min   | Payment processing failing at 50%    |
| SEV-3    | Minor feature degraded, limited user impact         | 1 hour        | Every 2 hours  | Search results slow (>5s P99)        |
| SEV-4    | Cosmetic issue or minor inconvenience               | 4 hours       | Daily          | Dashboard widget rendering incorrectly|

## Escalation Matrix

```
SEV-1 Escalation Chain:
  0 min  → On-call engineer (PagerDuty primary)
  5 min  → PagerDuty secondary + Engineering Manager
  15 min → VP Engineering + CTO notification
  30 min → Executive team briefing

SEV-2 Escalation Chain:
  0 min  → On-call engineer (PagerDuty primary)
  15 min → PagerDuty secondary
  60 min → Engineering Manager
```

| Role                    | Contact               | Escalation Trigger        |
|------------------------|-----------------------|---------------------------|
| Primary On-call         | PagerDuty rotation    | Alert fires               |
| Secondary On-call       | PagerDuty rotation    | Primary no-ack in 5 min   |
| Engineering Manager     | @eng-manager (Slack)  | SEV-1 auto, SEV-2 at 60m  |
| Database Admin          | @dba-oncall (Slack)   | Database-related incidents|
| Infrastructure Lead     | @infra-lead (Slack)   | Infrastructure failures   |
| VP Engineering          | @vp-eng (Slack)       | SEV-1 at 15 min           |

## Incident Commander Responsibilities

The first responder becomes the Incident Commander (IC) until explicitly handed off:

1. **Acknowledge** the alert in PagerDuty within the response time window.
2. **Assess** severity and adjust if initial classification is wrong.
3. **Communicate** by creating an incident channel: `#inc-YYYY-MM-DD-brief-description`.
4. **Coordinate** by pulling in required specialists (DBA, infra, security).
5. **Mitigate** by focusing on restoring service before root cause analysis.
6. **Update** stakeholders at the defined cadence.
7. **Resolve** and schedule post-mortem within 48 hours.

## Initial Triage Steps

When an alert fires, follow this diagnostic flow:

```bash
# 1. Check pod health in affected namespace
kubectl get pods -n backend -o wide
kubectl describe pod <pod-name> -n backend

# 2. Check recent deployments (was something just deployed?)
kubectl rollout history deployment/<service> -n backend

# 3. Check service logs for errors
kubectl logs -l app=<service> -n backend --tail=100 --since=15m

# 4. Check Prometheus for anomalies
# Open Grafana: https://grafana.shopflow.io/d/service-overview
# Check error rate, latency, and request volume panels

# 5. Check infrastructure health
kubectl top nodes
kubectl get events -n backend --sort-by=.lastTimestamp | tail -20

# 6. Check external dependencies
# RDS: AWS Console → RDS → Performance Insights
# Redis: kubectl exec -it redis-0 -n backend -- redis-cli INFO
# DNS: dig api.shopflow.io
```

## Common Incident Scenarios

### High Error Rate (5xx)

```bash
# Identify which pods are unhealthy
kubectl get pods -n backend | grep -v Running

# Check for OOM kills
kubectl get events -n backend --field-selector reason=OOMKilled

# Check resource pressure
kubectl top pods -n backend --sort-by=memory

# If a single pod is problematic, delete it to trigger restart
kubectl delete pod <pod-name> -n backend

# If widespread, check recent deployment and rollback
kubectl rollout undo deployment/<service> -n backend
```

### Database Connection Issues

```bash
# Check connection count on RDS
# Grafana → Database Performance dashboard

# Check for long-running queries
kubectl exec -it <pod-name> -n backend -- \
  psql $DATABASE_URL -c "SELECT pid, age(clock_timestamp(), query_start), query FROM pg_stat_activity WHERE state = 'active' ORDER BY query_start;"

# Kill long-running queries if needed
kubectl exec -it <pod-name> -n backend -- \
  psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';"
```

See [runbooks/database-recovery.md](../runbooks/database-recovery.md) for full
database recovery procedures.

### Node Pressure

```bash
# Check node conditions
kubectl describe nodes | grep -A5 "Conditions:"

# Check disk pressure
kubectl top nodes
df -h  # on the node via SSM

# Cordon the problematic node
kubectl cordon <node-name>

# Drain if needed (respects PDBs)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
```

## Communication Template

### Internal Status Update (Slack)

```
**Incident Update — [SEV-X] [Brief Title]**

**Status**: Investigating / Identified / Mitigating / Resolved
**Impact**: [Description of user-facing impact]
**Duration**: [Started at HH:MM UTC, ongoing / resolved at HH:MM UTC]
**IC**: @name
**Current Actions**:
- [What is being done right now]
- [Next steps]
**ETA**: [Estimated time to resolution, or "Unknown"]

Next update at HH:MM UTC.
```

### External Status Page Update

```
**[Service Name] — [Investigating/Identified/Monitoring/Resolved]**

We are currently experiencing [brief description of impact].
[X]% of users may notice [specific symptom].

Our engineering team is actively working on a resolution.
We will provide an update within [X] minutes.

Last updated: YYYY-MM-DD HH:MM UTC
```

## Post-Mortem Process

Every SEV-1 and SEV-2 incident requires a post-mortem. SEV-3 post-mortems are
encouraged but optional.

### Timeline

| Step                          | Deadline                    |
|-------------------------------|-----------------------------|
| Post-mortem document created  | Within 24 hours             |
| Draft completed by IC         | Within 48 hours             |
| Review meeting scheduled      | Within 5 business days      |
| Action items assigned         | During review meeting       |
| Action items completed        | Within 2 sprints            |

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date**: YYYY-MM-DD
**Severity**: SEV-X
**Duration**: X hours Y minutes
**IC**: @name
**Author**: @name

## Summary
[2-3 sentence summary of what happened]

## Impact
- Users affected: [number or percentage]
- Revenue impact: [estimated]
- Error budget consumed: [X minutes of Y remaining]

## Timeline (UTC)
| Time  | Event |
|-------|-------|
| HH:MM | Alert fired: [alert name] |
| HH:MM | IC acknowledged, started investigation |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service restored |

## Root Cause
[Detailed technical explanation]

## What Went Well
- [Item 1]
- [Item 2]

## What Went Wrong
- [Item 1]
- [Item 2]

## Action Items
| Action | Owner | Priority | Deadline |
|--------|-------|----------|----------|
| [Item] | @name | P1       | YYYY-MM-DD |

## Lessons Learned
[Key takeaways for the team]
```

## Tools and Access

| Tool              | URL                                   | Access          |
|-------------------|---------------------------------------|-----------------|
| PagerDuty         | shopflow.pagerduty.com                | SSO             |
| Grafana           | grafana.shopflow.io                   | SSO             |
| AWS Console       | shopflow.signin.aws.amazon.com        | SSO + MFA       |
| Status Page       | status.shopflow.io (Statuspage)       | Admin team      |
| Incident Slack    | #inc-* channels                       | Auto-created    |

For monitoring setup and alert definitions, see [monitoring.md](../monitoring.md).
