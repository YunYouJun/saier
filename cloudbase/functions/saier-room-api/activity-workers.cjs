function createActivityOutboxPublisher(options) {
  if (typeof options.publish !== 'function')
    throw new TypeError('Activity outbox publisher requires a publish function.')
  return {
    async publishPending(limit = 100) {
      const records = await options.repo.listPendingActivityOutbox(normalizeLimit(limit))
      const published = []
      for (const record of records) {
        const notification = publicOutboxNotification(record)
        await options.publish(notification)
        const publishedAt = options.now()
        await options.repo.markActivityOutboxPublished(record.id, publishedAt)
        published.push({ id: record.id, publishedAt })
      }
      return published
    },
  }
}

function createActivityDeadlineWorker(options) {
  return {
    async scanDue(limit = 25) {
      return options.commandService.processDueSessions(normalizeLimit(limit))
    },
    async rebuildAccelerationIndex(limit = 500) {
      if (!options.deadlineIndex)
        return { indexed: 0, skipped: true }
      const sessions = await options.repo.listActiveActivitySessions(normalizeLimit(limit))
      let indexed = 0
      for (const session of sessions) {
        if (!Number.isFinite(session.deadlineAt) || !session.round?.roundId)
          continue
        await options.deadlineIndex.add({
          activityEpoch: session.activityEpoch,
          deadlineAt: session.deadlineAt,
          phase: session.phase,
          phaseEpoch: session.phaseEpoch,
          roundId: session.round.roundId,
          sessionId: session.sessionId,
        })
        indexed += 1
      }
      return { indexed, skipped: false }
    },
  }
}

function publicOutboxNotification(record) {
  return {
    activityEpoch: record.activityEpoch,
    eventIds: Array.isArray(record.eventIds) ? [...record.eventIds] : [],
    latestCanvasSeq: finiteInteger(record.latestCanvasSeq),
    latestEventSeq: finiteInteger(record.latestEventSeq) ?? 0,
    privateAudienceUserIds: Array.isArray(record.privateAudienceUserIds)
      ? record.privateAudienceUserIds.filter(value => typeof value === 'string')
      : [],
    privateProjectionRevision: finiteInteger(record.privateProjectionRevision),
    roomId: record.roomId,
    sessionId: record.sessionId,
    type: 'activityCommitted',
  }
}

function normalizeLimit(value) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 500) : 100
}

function finiteInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function isActivityDeadlineTimerEvent(event, triggerName) {
  return event?.Type === 'Timer'
    && (triggerName === undefined || event.TriggerName === triggerName)
}

module.exports = {
  createActivityDeadlineWorker,
  createActivityOutboxPublisher,
  isActivityDeadlineTimerEvent,
  publicOutboxNotification,
}
