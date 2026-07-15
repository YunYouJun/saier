import { createSiteActivityLocation, parseLegacyPictionaryRoute } from '~/utils/activityPluginRoutes'

export default defineNuxtRouteMiddleware((to) => {
  const legacyRequest = parseLegacyPictionaryRoute(to.path, to.query)
  if (!legacyRequest)
    return

  return navigateTo(createSiteActivityLocation(legacyRequest), { replace: true })
})
