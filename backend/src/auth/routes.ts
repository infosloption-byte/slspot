import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config/env.js'
import { AuthError, type AuthSession, type AuthService } from './service.js'

export type AuthServiceLike = Pick<AuthService,
  'register' | 'login' | 'authenticateSession' | 'logout' | 'logoutAll' |
  'listSessions' | 'revokeSession' | 'verifyEmail' | 'requestEmailVerification' |
  'requestPasswordReset' | 'resetPassword' | 'verifyTwoFactorChallenge' | 'getTwoFactorStatus' |
  'setupTwoFactor' | 'enableTwoFactor' | 'disableTwoFactor' | 'listDevices' | 'listLoginHistory' | 'listSecurityEvents'
>

const PREFIX='/api/v1/auth'

function ok<T>(request: FastifyRequest, data: T) {
  return { success: true, data, requestId: request.id }
}

async function requireSession(request: FastifyRequest, service: AuthServiceLike): Promise<AuthSession> {
  const session=await service.authenticateSession(request.cookies?.[env.auth.cookieName])
  if (!session) throw new AuthError(401,'UNAUTHENTICATED','Authentication is required')
  return session
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(env.auth.cookieName, token, {
    path:'/', httpOnly:true, secure:env.auth.cookieSecure,
    sameSite:env.auth.cookieSameSite, domain:env.auth.cookieDomain, expires:expiresAt,
  })
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(env.auth.cookieName, {
    path:'/', httpOnly:true, secure:env.auth.cookieSecure,
    sameSite:env.auth.cookieSameSite, domain:env.auth.cookieDomain,
  })
}

export function registerAuthRoutes(app: FastifyInstance, service: AuthServiceLike): void {
  app.post<{Body:{email:string;password:string;countryCode?:string}}>(PREFIX+'/register',{
    schema:{body:{type:'object',required:['email','password'],additionalProperties:false,properties:{
      email:{type:'string',minLength:3,maxLength:254},password:{type:'string',minLength:10,maxLength:128},
      countryCode:{type:'string',minLength:2,maxLength:2},
    }}},
  },async(request,reply)=>{
    const result=await service.register(request.body)
    const data:Record<string,unknown>={accepted:true}
    if(env.auth.exposeDevTokens && result.verification) data.verification=result.verification
    return reply.status(202).send(ok(request,data))
  })

  app.post<{Body:{email:string;password:string;rememberDevice?:boolean}}>(PREFIX+'/login',{
    schema:{body:{type:'object',required:['email','password'],additionalProperties:false,properties:{
      email:{type:'string',minLength:3,maxLength:254},password:{type:'string',minLength:10,maxLength:128},
    }}},
  },async(request,reply)=>{
    const result=await service.login({...request.body,ipAddress:request.ip,userAgent:request.headers['user-agent']})
    setSessionCookie(reply,result.sessionToken,result.session.expiresAt)
    return reply.send(ok(request,{user:result.session,expiresAt:result.session.expiresAt}))
  })

  app.post<{Body:{challengeToken:string;code?:string;recoveryCode?:string;rememberDevice?:boolean}}>(PREFIX+'/2fa/verify',{
    schema:{body:{type:'object',required:['challengeToken'],additionalProperties:false,properties:{
      challengeToken:{type:'string',minLength:20,maxLength:256},
      code:{type:'string',minLength:6,maxLength:6},
      recoveryCode:{type:'string',minLength:8,maxLength:32},
      rememberDevice:{type:'boolean'},
    }}},
  },async(request,reply)=>{
    const result=await service.verifyTwoFactorChallenge({...request.body,ipAddress:request.ip,userAgent:request.headers['user-agent']})
    if (result.requiresTwoFactor) return reply.status(202).send(ok(request,result))
    setSessionCookie(reply,result.sessionToken,result.session.expiresAt)
    return reply.send(ok(request,result))
  })

  app.get(PREFIX+'/2fa/status',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,await service.getTwoFactorStatus(session.id))
  })

  app.post(PREFIX+'/2fa/setup',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,await service.setupTwoFactor(session.id))
  })

  app.post<{Body:{code:string}}>(PREFIX+'/2fa/enable',{
    schema:{body:{type:'object',required:['code'],additionalProperties:false,properties:{code:{type:'string',minLength:6,maxLength:6}}}},
  },async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,await service.enableTwoFactor(session.id,request.body.code))
  })

  app.post<{Body:{code:string}}>(PREFIX+'/2fa/disable',{
    schema:{body:{type:'object',required:['code'],additionalProperties:false,properties:{code:{type:'string',minLength:6,maxLength:6}}}},
  },async(request)=>{
    const session=await requireSession(request,service)
    await service.disableTwoFactor(session.id,request.body.code)
    return ok(request,{disabled:true})
  })

  app.get(PREFIX+'/devices',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,{devices:await service.listDevices(session.id)})
  })

  app.get(PREFIX+'/login-history',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,{items:await service.listLoginHistory(session.id)})
  })

  app.get(PREFIX+'/security-events',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,{items:await service.listSecurityEvents(session.id)})
  })

  app.post(PREFIX+'/logout',async(request,reply)=>{
    const session=await requireSession(request,service)
    await service.logout(session.sessionId); clearSessionCookie(reply)
    return reply.send(ok(request,{loggedOut:true}))
  })

  app.post(PREFIX+'/logout-all',async(request,reply)=>{
    const session=await requireSession(request,service)
    await service.logoutAll(session.id); clearSessionCookie(reply)
    return reply.send(ok(request,{loggedOut:true}))
  })

  app.get(PREFIX+'/me',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,{user:session,sessionId:session.sessionId})
  })

  app.get(PREFIX+'/sessions',async(request)=>{
    const session=await requireSession(request,service)
    return ok(request,{sessions:await service.listSessions(session.id,session.sessionId)})
  })

  app.delete<{Params:{sessionId:string}}>(PREFIX+'/sessions/:sessionId',async(request,reply)=>{
    const session=await requireSession(request,service)
    await service.revokeSession(session.id,request.params.sessionId)
    if(request.params.sessionId===session.sessionId) clearSessionCookie(reply)
    return reply.send(ok(request,{revoked:true}))
  })

  app.post<{Body:{token:string}}>(PREFIX+'/verify-email',{
    schema:{body:{type:'object',required:['token'],additionalProperties:false,properties:{token:{type:'string',minLength:20,maxLength:256}}}},
  },async(request)=>ok(request,{user:await service.verifyEmail(request.body.token)}))

  app.post<{Body:{email:string}}>(PREFIX+'/verify-email/request',{
    schema:{body:{type:'object',required:['email'],additionalProperties:false,properties:{email:{type:'string',minLength:3,maxLength:254}}}},
  },async(request)=>{
    const result=await service.requestEmailVerification(request.body.email)
    return ok(request,env.auth.exposeDevTokens&&result?{requested:true,verification:result}:{requested:true})
  })

  app.post<{Body:{email:string}}>(PREFIX+'/forgot-password',{
    schema:{body:{type:'object',required:['email'],additionalProperties:false,properties:{email:{type:'string',minLength:3,maxLength:254}}}},
  },async(request)=>{
    const result=await service.requestPasswordReset(request.body.email)
    return ok(request,env.auth.exposeDevTokens&&result?{requested:true,reset:result}:{requested:true})
  })

  app.post<{Body:{token:string;password:string}}>(PREFIX+'/reset-password',{
    schema:{body:{type:'object',required:['token','password'],additionalProperties:false,properties:{
      token:{type:'string',minLength:20,maxLength:256},password:{type:'string',minLength:10,maxLength:128},
    }}},
  },async(request,reply)=>{
    await service.resetPassword(request.body.token,request.body.password)
    clearSessionCookie(reply)
    return reply.send(ok(request,{reset:true}))
  })
}
