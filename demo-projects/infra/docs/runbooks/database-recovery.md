# Database Recovery Runbook

## Overview

ShopFlow uses Amazon RDS PostgreSQL 16 in a Multi-AZ configuration for production.
This runbook covers backup verification, point-in-time recovery, failover procedures,
and data consistency checks. All database infrastructure is managed via Terraform
(see [terraform.md](../terraform.md)).

## Backup Configuration

| Parameter                  | Dev          | Staging      | Production   |
|---------------------------|--------------|--------------|--------------|
| Automated backup retention | 7 days       | 7 days       | 35 days      |
| Backup window              | 03:00-04:00  | 03:00-04:00  | 03:00-04:00  |
| Multi-AZ                   | No           | No           | Yes          |
| Storage encrypted          | Yes (KMS)    | Yes (KMS)    | Yes (KMS)    |
| Performance Insights       | Disabled     | Enabled      | Enabled      |
| Manual snapshots           | Weekly       | Weekly       | Daily + weekly|
| Cross-region backup        | No           | No           | Yes (us-west-2)|

## Manual Snapshot Creation

Before any major operation (migration, schema change, data import), create a
manual snapshot:

```bash
# Create a manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier shopflow-production \
  --db-snapshot-identifier shopflow-prod-pre-migration-$(date +%Y%m%d-%H%M) \
  --region us-east-1

# Verify snapshot status
aws rds describe-db-snapshots \
  --db-snapshot-identifier shopflow-prod-pre-migration-20250115-1430 \
  --query 'DBSnapshots[0].{Status:Status,PercentProgress:PercentProgress}'

# Wait for completion
aws rds wait db-snapshot-available \
  --db-snapshot-identifier shopflow-prod-pre-migration-20250115-1430
```

## Point-in-Time Recovery (PITR)

RDS continuously backs up transaction logs, allowing recovery to any second within
the retention window (up to 35 days in production).

### When to Use PITR

- Accidental data deletion or corruption
- Bad migration that corrupted specific tables
- Need to recover data from a specific point before an incident

### PITR Procedure

```bash
# Step 1: Identify the target recovery time
# Check application logs and monitoring for when the issue occurred
# Target time should be BEFORE the problematic event (UTC)

# Step 2: Create a new RDS instance from the point-in-time backup
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier shopflow-production \
  --target-db-instance-identifier shopflow-prod-recovery-$(date +%Y%m%d) \
  --restore-time "2025-01-15T10:30:00Z" \
  --db-instance-class db.r6g.xlarge \
  --db-subnet-group-name shopflow-prod-db-subnet \
  --vpc-security-group-ids sg-0abc123def456 \
  --no-multi-az \
  --region us-east-1

# Step 3: Wait for the recovery instance to become available
aws rds wait db-instance-available \
  --db-instance-identifier shopflow-prod-recovery-20250115

# Step 4: Get the endpoint of the recovery instance
aws rds describe-db-instances \
  --db-instance-identifier shopflow-prod-recovery-20250115 \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

### Extracting Data from Recovery Instance

```bash
# Connect to recovery instance and export the needed data
RECOVERY_HOST=$(aws rds describe-db-instances \
  --db-instance-identifier shopflow-prod-recovery-20250115 \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# Export specific tables
pg_dump -h $RECOVERY_HOST -U shopflow_admin -d shopflow \
  --table=orders --table=order_items \
  --data-only --format=custom \
  -f /tmp/recovered_orders.dump

# Import recovered data into production (after verifying)
pg_restore -h shopflow-production.abc123.us-east-1.rds.amazonaws.com \
  -U shopflow_admin -d shopflow \
  --data-only --disable-triggers \
  /tmp/recovered_orders.dump

# Clean up: delete the recovery instance when done
aws rds delete-db-instance \
  --db-instance-identifier shopflow-prod-recovery-20250115 \
  --skip-final-snapshot
```

## Multi-AZ Failover

Production runs Multi-AZ. AWS automatically fails over to the standby replica
if the primary becomes unhealthy. Manual failover can be triggered for testing
or maintenance.

### Automatic Failover Triggers

- Primary instance hardware failure
- Operating system patching on primary
- Primary AZ network disruption
- Primary instance type change (via modify)

### Manual Failover

```bash
# Trigger manual failover (for testing or planned maintenance)
aws rds reboot-db-instance \
  --db-instance-identifier shopflow-production \
  --force-failover

# Monitor failover progress
aws rds describe-events \
  --source-identifier shopflow-production \
  --source-type db-instance \
  --duration 60 \
  --query 'Events[*].{Time:Date,Message:Message}'
```

### Failover Impact

| Metric              | Expected Value       |
|---------------------|---------------------|
| Failover duration   | 60-120 seconds      |
| DNS propagation     | ~30 seconds         |
| Connection drops    | Yes (reconnect required) |
| Data loss           | None (synchronous replication) |

### Application Recovery After Failover

Applications using connection pooling (PgBouncer) will automatically reconnect.
Verify recovery:

```bash
# Check application pod logs for reconnection
kubectl logs -l app=catalog-service -n backend --since=5m | grep -i "database\|connection\|reconnect"

# Verify database connectivity from a pod
kubectl exec -it $(kubectl get pods -l app=catalog-service -n backend -o jsonpath='{.items[0].metadata.name}') \
  -n backend -- psql $DATABASE_URL -c "SELECT 1;"

# Check active connections
kubectl exec -it $(kubectl get pods -l app=catalog-service -n backend -o jsonpath='{.items[0].metadata.name}') \
  -n backend -- psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

## Data Consistency Checks

Run these checks after any recovery operation or suspected data corruption:

### Table-Level Integrity

```sql
-- Check for orphaned order items (no parent order)
SELECT oi.id, oi.order_id
FROM order_items oi
LEFT JOIN orders o ON o.id = oi.order_id
WHERE o.id IS NULL;

-- Check for orders with inconsistent totals
SELECT o.id, o.total_amount, SUM(oi.quantity * oi.unit_price) AS calculated_total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.total_amount
HAVING o.total_amount != SUM(oi.quantity * oi.unit_price);

-- Check for inventory mismatches
SELECT p.id, p.name, p.stock_count,
  COALESCE(SUM(CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END), 0) AS calculated_stock
FROM products p
LEFT JOIN inventory_movements im ON im.product_id = p.id
GROUP BY p.id, p.name, p.stock_count
HAVING p.stock_count != COALESCE(SUM(CASE WHEN im.type = 'in' THEN im.quantity ELSE -im.quantity END), 0);

-- Verify payment records match order statuses
SELECT o.id, o.status, p.status AS payment_status
FROM orders o
JOIN payments p ON p.order_id = o.id
WHERE o.status = 'paid' AND p.status != 'completed'
   OR o.status = 'pending' AND p.status = 'completed';
```

### Sequence Integrity

```sql
-- Check sequences are ahead of max IDs (prevents duplicate key errors)
SELECT
  schemaname || '.' || tablename AS table_name,
  pg_get_serial_sequence(schemaname || '.' || tablename, 'id') AS sequence_name,
  (SELECT last_value FROM pg_sequences WHERE schemaname || '.' || sequencename = pg_get_serial_sequence(schemaname || '.' || tablename, 'id')) AS seq_value,
  (SELECT MAX(id) FROM pg_catalog.pg_class WHERE relname = tablename) AS max_id
FROM pg_tables
WHERE schemaname = 'public';

-- Fix a sequence if needed
SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders) + 1);
```

### Replication Lag Check

```sql
-- On the primary (check replication status)
SELECT
  client_addr,
  state,
  sent_lsn,
  replay_lsn,
  pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replication_lag_bytes
FROM pg_stat_replication;
```

## Disaster Recovery

In the event of a complete region failure (us-east-1), the cross-region backup
in us-west-2 can be used to restore:

```bash
# List available cross-region snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier shopflow-production \
  --snapshot-type automated \
  --region us-west-2

# Restore in the DR region
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier shopflow-dr \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.r6g.xlarge \
  --region us-west-2
```

**Recovery Time Objective (RTO)**: 4 hours for full region failover.
**Recovery Point Objective (RPO)**: 1 hour (cross-region backup lag).

For incident escalation during database emergencies, see
[runbooks/incident-response.md](incident-response.md). For database-related
monitoring alerts, see [monitoring.md](../monitoring.md).
