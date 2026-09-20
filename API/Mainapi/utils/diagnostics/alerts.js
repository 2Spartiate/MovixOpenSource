'use strict';

const ALERT_THRESHOLDS = Object.freeze({ networkMiBPerSecond: 20, cpuPercent: 300, cooldownMs: 5 * 60 * 1000 });

function createThresholdGate({ now = Date.now } = {}) {
  let nextAllowedAt = -Infinity;
  return {
    take(sample) {
      if (!Number.isFinite(sample?.elapsedMs) || sample.elapsedMs <= 0) return null;
      const rate = (bytes) => Number.isFinite(bytes) && bytes >= 0 ? bytes * 1000 / sample.elapsedMs / 1048576 : null;
      const rxMiBPerSecond = rate(sample.rxBytes), txMiBPerSecond = rate(sample.txBytes);
      const cpuPercent = Number.isFinite(sample.cpuPercent) ? sample.cpuPercent : null;
      const triggers = [];
      if (rxMiBPerSecond > ALERT_THRESHOLDS.networkMiBPerSecond) triggers.push('network-rx');
      if (txMiBPerSecond > ALERT_THRESHOLDS.networkMiBPerSecond) triggers.push('network-tx');
      if (cpuPercent > ALERT_THRESHOLDS.cpuPercent) triggers.push('cpu');
      const at = now();
      if (!triggers.length || at < nextAllowedAt) return null;
      // Reserve before sending, including failed sends: no retry storm during a peak.
      nextAllowedAt = at + ALERT_THRESHOLDS.cooldownMs;
      return { at: sample.at, elapsedMs: sample.elapsedMs, triggers, cpuPercent, rxMiBPerSecond, txMiBPerSecond };
    },
  };
}

function describeThresholdAlert(alert) {
  const values = [];
  if (alert?.triggers?.includes('cpu')) values.push(`CPU ${Number(alert.cpuPercent).toFixed(1)} % (> 300 %)`);
  if (alert?.triggers?.includes('network-rx')) values.push(`réception ${Number(alert.rxMiBPerSecond).toFixed(2)} Mio/s (> 20 Mio/s)`);
  if (alert?.triggers?.includes('network-tx')) values.push(`envoi ${Number(alert.txMiBPerSecond).toFixed(2)} Mio/s (> 20 Mio/s)`);
  return `${values.join(' ; ') || 'seuil de ressources dépassé'} — moyenne sur ${(Number(alert?.elapsedMs || 0) / 1000).toFixed(1)} s`;
}

module.exports = { ALERT_THRESHOLDS, createThresholdGate, describeThresholdAlert };
