import type { FastifyInstance, FastifyRequest } from 'fastify'
import { CURRENT_POLICY_VERSIONS, POLICY_DEFINITIONS, REGISTRATION_POLICY_TYPES } from './registry.js'

const PREFIX = '/api/v1/policies'

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true as const, data, requestId: request.id }
}

/**
 * The API is the source of truth for displayed policy versions. Policy wording is
 * currently a review draft in the frontend and must be approved before launch.
 */
export function registerPolicyRoutes(app: FastifyInstance): void {
  app.get(PREFIX + '/current', async (request) => {
    return ok(request, {
      status: 'DRAFT' as const,
      draftNotice: 'Policy pages are implementation drafts and require final review before production use.',
      registrationRequired: [...REGISTRATION_POLICY_TYPES],
      policies: POLICY_DEFINITIONS.map((policy) => ({
        ...policy,
        version: CURRENT_POLICY_VERSIONS[policy.type],
        status: 'DRAFT' as const,
      })),
    })
  })
}
