/**
 * Structured audit log for auth events.
 * Logs to stdout — picked up by Docker logging driver.
 */
export function auditLog(
  event: "login_success" | "login_failure" | "logout" | "rate_limit" | "account_change",
  details: { ip: string; email?: string; reason?: string }
) {
  console.log(
    JSON.stringify({
      type: "audit",
      event,
      ...details,
      timestamp: new Date().toISOString(),
    })
  );
}
