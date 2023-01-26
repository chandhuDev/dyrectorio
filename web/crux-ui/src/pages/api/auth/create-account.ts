import { HEADER_LOCATION } from '@app/const'
import { missingParameter } from '@app/error-responses'
import { CreateAccount, toRecoverNewPasswordError } from '@app/models'
import { Identity, UpdateRecoveryFlowWithCodeMethod } from '@ory/kratos-client'
import { Crux } from '@server/crux/crux'
import { useErrorMiddleware } from '@server/error-middleware'
import kratos, {
  cookieOf,
  flowOfUrl,
  forwardCookieToResponse,
  identityRecovered,
  obtainSessionFromResponse,
} from '@server/kratos'
import useKratosErrorMiddleware from '@server/kratos-error-middleware'
import { withMiddlewares } from '@server/middlewares'
import { NextApiRequest, NextApiResponse } from 'next'

const acceptInvitation = async (idenity: Identity, teamId: string): Promise<void> => {
  try {
    await Crux.withIdentity(idenity).teams.acceptInvitation(teamId)
  } catch (err) {
    console.error('[ERROR][TEAM]: Failed to accept invitation', err)
  }
}

const onPost = async (req: NextApiRequest, res: NextApiResponse) => {
  const dto = req.body as CreateAccount
  if (!dto.team) {
    throw missingParameter('team')
  }

  const cookie = cookieOf(req)

  const body: UpdateRecoveryFlowWithCodeMethod = {
    method: 'code',
    code: dto.code,
  }

  try {
    const kratosRes = await kratos.updateRecoveryFlow({
      flow: dto.flow,
      cookie,
      updateRecoveryFlowBody: body,
    })

    res.status(kratosRes.status).json(kratosRes.data)
  } catch (err) {
    const error = toRecoverNewPasswordError(err)

    if (error) {
      forwardCookieToResponse(res, error)
      const settingsFlow = flowOfUrl(error.data.redirect_browser_to)

      const session = await obtainSessionFromResponse(error)
      await identityRecovered(session, settingsFlow)

      await acceptInvitation(session.identity, dto.team)

      res.status(201).setHeader(HEADER_LOCATION, error.data.redirect_browser_to).end()
      return
    }

    throw err
  }
}

export default withMiddlewares(
  {
    onPost,
  },
  [useErrorMiddleware, useKratosErrorMiddleware],
  false,
)