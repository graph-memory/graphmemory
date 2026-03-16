---
id: deploy-to-staging
source: user
confidence: 1
triggers:
  - deploy staging
  - push to staging
  - staging deployment
inputHints:
  - branch name
  - version tag
filePatterns:
  - Dockerfile
  - docker-compose.yml
  - .github/workflows/deploy.yml
tags:
  - devops
  - deployment
  - staging
createdAt: 2026-03-16T20:40:55.264Z
updatedAt: 2026-03-16T20:40:55.264Z
relations:
  - to: run-and-debug-tests
    kind: depends_on
---

# Deploy to Staging

Process for deploying the TaskFlow application to the staging environment.

## Steps
1. Ensure all tests pass: npm test
2. Build Docker image: docker build -t taskflow:staging .
3. Push to registry: docker push registry/taskflow:staging
4. SSH into staging server
5. Pull new image: docker pull registry/taskflow:staging
6. Run migrations: npm run db:migrate
7. Restart service: docker-compose up -d
8. Verify health endpoint: curl https://staging.taskflow.dev/health
