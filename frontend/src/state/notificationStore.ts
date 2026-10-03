import { createStore, useStore } from './createStore'

export type NotificationState = {
  unreadCount: number
  lastEventAt: string | null
}

export const notificationStore = createStore<NotificationState>({
  unreadCount: 0,
  lastEventAt: null,
})

export function useNotificationStore(): NotificationState {
  return useStore(notificationStore)
}

export function setUnreadCount(unreadCount: number): void {
  notificationStore.setState((current) => ({
    ...current,
    unreadCount: Math.max(0, unreadCount),
  }))
}

export function recordNotificationEvent(timestamp = new Date().toISOString()): void {
  notificationStore.setState((current) => ({
    unreadCount: current.unreadCount + 1,
    lastEventAt: timestamp,
  }))
}

export function decrementUnreadCount(): void {
  notificationStore.setState((current) => ({
    ...current,
    unreadCount: Math.max(0, current.unreadCount - 1),
  }))
}

export function clearNotificationCount(): void {
  notificationStore.setState((current) => ({ ...current, unreadCount: 0 }))
}
