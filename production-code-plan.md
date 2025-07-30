# Production Code Plan - MCP Voice/Text Q-SYS

**Document Version**: 1.2  
**Created**: 2025-01-29  
**Last Modified**: 2025-07-30
**Approach**: Proper & Reliable (Full Refactoring)  
**Timeline**: 10-12 weeks  
**Team Size**: 1-2 developers recommended

## Executive Summary

This plan outlines the systematic transformation of the MCP Voice/Text Q-SYS codebase from its current prototype state into a production-ready system. Following the "Proper & Reliable" approach, we will address all fundamental issues through comprehensive refactoring rather than quick fixes.

### Progress Update (2025-07-30)
**Significant progress has been made:**
- ✅ **Phase 1**: 80% complete (Week 2 fully complete)
- ✅ **Phase 2**: 60% complete (Architecture refactoring done)
- ✅ **Phase 3**: 70% complete (Monitoring & resilience implemented)
- ⚠️ **Test Coverage**: Currently at 67.7%, needs to reach 80% (BUG-141/142/143)
- ⚠️ **ESLint Issues**: 3 errors, 63 warnings remain (BUG-140)

## Current State Assessment

### Strengths ✅
- **Core Functionality**: Q-SYS integration and MCP protocol work correctly
- **Modern Stack**: TypeScript, ESM modules, async/await patterns
- **Event Architecture**: Solid foundation, needs optimization
- **Test Coverage**: 900+ tests exist (currently 4 failing, down from 40) ✅
- **Configuration**: Recently centralized (BUG-133 resolved) ✅

### Critical Issues 🚨
- **No Authentication**: Anyone can control Q-SYS systems ⚠️ *Partial - BUG-136 added auth framework*
- **No Rate Limiting**: Vulnerable to DoS attacks ✅ *RESOLVED - BUG-136*
- **No Input Validation**: Security vulnerabilities ✅ *RESOLVED - BUG-136*
- **Architectural Debt**: Tight coupling, no dependency injection ✅ *RESOLVED - BUG-135*
- **Complex State Management**: 6 overlapping cache systems ✅ *RESOLVED - BUG-132*
- **Missing Monitoring**: No observability in production ⚠️ *Partial - BUG-136 added metrics*

## Phase 1: Stabilization (Weeks 1-2)

### Week 1: Code Quality & Testing
**Goal**: Clean, stable codebase with passing tests

#### Tasks:
1. **Fix ESLint Warnings** (2 days) ⚠️ *IN PROGRESS - BUG-140*
   - Fix unsafe type access, unnecessary conditionals, complex constructors, etc.
   - Add unit tests for each fix
   - *Status: 63 warnings remain, 3 errors*

2. **Stabilize Test Suite** (3 days) ⚠️ *MOSTLY COMPLETE*
   - Fix or isolate 40 failing tests ✅ *Down to 4 failing tests*
   - Create separate integration test suite ✅ *Done*
   - Add test categories: unit, integration, e2e ✅ *Done*
   - Configure CI to run appropriate test suites ⚠️ *Needs coverage threshold fix*

3. **Develop End-to-End (E2E) Test Suite** (Ongoing)
   - **Details**: Create a separate E2E test suite (e.g., using Jest and Supertest) that tests complete user workflows. This suite will run against a deployed instance to validate real-world scenarios.

### Week 2: Foundational Hardening
**Goal**: Basic security and configuration measures in place

#### Tasks:
1. **Input Validation** (2 days) ✅ *COMPLETE - BUG-136*
   - Add Zod schemas for all API endpoints and MCP tool parameters. ✅
   - Sanitize all inputs to prevent injection attacks. ✅

2. **Rate Limiting** (1 day) ✅ *COMPLETE - BUG-136*
   - Implement `express-rate-limit` with a Redis store for distributed rate limiting. ✅

3. **Implement Environment-Aware Configuration** (1 day) ✅ *COMPLETE - BUG-133/138*
    - **Details**: Use `dotenv` for local development (`.env` files) but rely exclusively on environment variables in staging/production containers. The application must fail on startup if required variables are missing.

4. **Centralized Error Handling** (1 day) ✅ *COMPLETE - BUG-043*
   - Create custom error classes and a global error handler. ✅
   - Implement graceful shutdown logic. ✅

## Phase 2: Architecture Refactoring (Weeks 3-5)

### Week 3: Decoupling and Interfaces
**Goal**: Decoupled, testable architecture

#### Tasks:
1. **Define Core Interfaces** (2 days) ✅ *COMPLETE - BUG-135*
   - Create interfaces for key services (`IQSysClient`, `IStateManager`, etc.). ✅

2. **Implement Dependency Injection** (3 days) ✅ *COMPLETE - BUG-135*
   - Use a DI container like InversifyJS to manage dependencies. ✅
   - *Note: Simple custom DI container implemented instead of InversifyJS*

### Week 4: State & Persistence
**Goal**: Simplified, robust state management

#### Tasks:
1. **Consolidate Cache Layers** (3 days) ✅ *COMPLETE - BUG-132*
   - Unify the 6 overlapping cache systems into a single `UnifiedStateManager`. ✅
   - *Implemented as SimpleStateManager*

2. **Define and Implement Production Persistence Layer** (2 days)
    - **Details**: Replace the placeholder `FilePersistence` with a production-grade solution. **Redis** is recommended for its performance and suitability for caching and state management. This task includes writing the `RedisPersistence` adapter for the `IStateManager`.

### Week 5: Clean Architecture
**Goal**: Clear separation of concerns

#### Tasks:
1. **Create Domain Models** (2 days)
   - Implement core domain entities like `Control`, `Component`, etc.

2. **Implement Use Cases** (3 days)
   - Refactor business logic into application-layer use cases (e.g., `SetControlValueUseCase`).

## Phase 3: Operational Readiness (Weeks 6-8)

### Week 6: Monitoring & Observability
**Goal**: Full visibility into system behavior

#### Tasks:
1. **Add Health Checks** (1 day) ✅ *COMPLETE - BUG-136*
   - Create a `/health` endpoint that checks dependencies (Q-SYS connection, database). ✅

2. **Implement Metrics Collection** (2 days) ✅ *COMPLETE - BUG-136*
   - Use `prom-client` to expose key metrics (e.g., request duration, active connections, control updates) for Prometheus. ✅

3. **Structured Logging** (2 days) ✅ *COMPLETE*
   - Implement `winston` for structured (JSON) logging with context. ✅

4. **Define and Configure Alerting Rules** (1 day)
    - **Details**: Implement alerts in Prometheus/Alertmanager or Grafana for critical conditions like API error rate > 2%, p95 latency > 500ms, Q-SYS client disconnections, or failed health checks.

### Week 7: Resilience & Recovery
**Goal**: A system that handles failures gracefully

#### Tasks:
1. **Circuit Breaker Pattern** (2 days) ✅ *COMPLETE - BUG-136*
   - Implement a circuit breaker for the Q-SYS client to prevent cascading failures. ✅

2. **Retry Logic with Backoff** (1 day) ✅ *COMPLETE*
   - Add exponential backoff to connection logic for Q-SYS and other external services. ✅

3. **Graceful Shutdown** (2 days) ✅ *COMPLETE - BUG-043*
   - Enhance shutdown logic to finish processing in-flight requests and close connections cleanly. ✅

### Week 8: Advanced Security
**Goal**: Secure infrastructure and secrets

#### Tasks:
1. **Centralized Secret Management** (3 days)
    - **Details**: Integrate with a dedicated secret manager like **HashiCorp Vault**, **AWS Secrets Manager**, or **Azure Key Vault**. This is more secure and scalable than managing secrets in environment variables or Kubernetes manifests directly.

2. **Security Hardening** (2 days)
    - Implement security best practices like secure headers (HSTS, CSP), XSS protection, etc.
    - Set up dependency vulnerability scanning with Snyk or similar.

## Phase 4: Documentation & Deployment (Weeks 9-10)

### Week 9: Documentation
**Goal**: Comprehensive documentation for all stakeholders

#### Tasks:
1. **API Documentation** (2 days)
   - Generate an OpenAPI/Swagger specification.

2. **Architecture Documentation** (2 days)
   - Create system overview diagrams, data flow docs, and Architectural Decision Records (ADRs).

3. **Create Developer Onboarding Documentation** (1 day)
    - **Details**: Create a `CONTRIBUTING.md` file with instructions for setting up the local development environment (ideally with a single command using Docker Compose), running tests, and following the contribution workflow.

### Week 10: Deployment & DevOps
**Goal**: Automated, reliable deployment pipeline

#### Tasks:
1. **Containerization** (2 days)
   - Create a multi-stage `Dockerfile` for a lean, secure production image.

2. **Kubernetes Deployment** (2 days)
   - Create Kubernetes manifests for the deployment, service, and ingress.

3. **CI/CD Pipeline** (1 day)
   - Build a GitHub Actions workflow for automated testing, building, and deployment.

4. **Implement Deployment Smoke Tests** (Coupled with CI/CD)
    - **Details**: Add a final step to the CI/CD pipeline that runs a small set of critical-path tests against the newly deployed version to confirm it is operational.

## Phase 5: Access Control (Weeks 11-12, TBD)

**Goal**: Secure access control (strategy to be finalized)

#### Tasks:
1. **Implement Authentication** (3 days)
   - **Details**: Based on the final decision, implement either an API Token/Bearer scheme for service-to-service communication or a full JWT-based flow for user accounts.
   ```typescript
   // Example: JWT Service
   export class JWTService {
     generateToken(user: User): string { /* ... */ }
     verifyToken(token: string): TokenPayload { /* ... */ }
   }
   ```

2. **Add Authorization** (2 days)
   - **Details**: If required, implement Role-Based Access Control (RBAC) to define permissions for different user roles (e.g., Admin, Operator, Viewer).
   ```typescript
   // Example: RBAC
   export enum Role { ADMIN = 'admin', OPERATOR = 'operator' }
   export const permissions = {
     [Role.ADMIN]: ['*'],
     [Role.OPERATOR]: ['control:read', 'control:write']
   };
   ```
3. **Implement User Management Service** (Optional, 3 days)
    - **Details**: If a full user model is chosen, create a `UserService` and secure admin endpoints for managing users and assigning roles.

## Success Metrics

(No changes from original plan)

## Risk Mitigation

(No changes from original plan)

## Team Structure & Budget

(No changes from original plan, though timeline is now 12 weeks)

## Conclusion

(No changes from original plan)

## Remaining Work

### Immediate Priorities (BUG-140 through BUG-143)
1. **Fix failing tests** (BUG-140) - 1-2 hours
2. **Increase test coverage to 80%** (BUG-141/142/143) - 3-4 days
3. **Fix ESLint warnings** - 2 days

### Outstanding Tasks
1. **Production Persistence Layer** (Redis implementation) - 2 days
2. **Domain Models & Use Cases** (Week 5) - 5 days
3. **Alerting Rules Configuration** - 1 day
4. **Security Hardening** - 2 days
5. **API Documentation** - 2 days
6. **Containerization & K8s** - 4 days
7. **Full Authentication System** (TBD strategy) - 5 days

### Total Estimated Time
- **Already Complete**: ~5 weeks of work
- **Remaining Work**: ~4 weeks
- **Original Timeline**: 10-12 weeks (on track)

## Next Steps

1. **Immediate**: Address BUG-140 through BUG-143 for test stability
2. **This Week**: Complete remaining Phase 1 tasks
3. **Next Sprint**: Focus on production persistence and deployment
4. **Final Phase**: Authentication system implementation

## Appendix A: Production Checklist

(No changes from original plan)

## Appendix B: Technology Stack

(No changes from original plan)

---

*This document should be treated as a living document and updated as the project progresses. Regular reviews should be conducted at the end of each phase to ensure alignment with goals and to adjust the plan as needed.*