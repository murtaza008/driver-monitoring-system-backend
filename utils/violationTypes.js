const TYPE_TO_LABEL = {
  // Current Android ViolationType enum names (see ViolationDurationTracker.kt)
  DROWSINESS: 'Drowsiness',
  PHONE: 'Mobile Usage',
  YAWNING: 'Yawning',
  DISTRACTION: 'Distraction',
  SEATBELT: 'Seatbelt',
  SMOKING: 'Smoking',
  SPEED: 'Speed',
  CRASH: 'Crash',
  // Legacy names kept for backward compatibility with any pre-existing rows
  DROWSY: 'Drowsiness',
  MOBILE_USAGE: 'Mobile Usage',
};

function normalizeViolationLabel(type) {
  if (!type) return 'General';
  if (TYPE_TO_LABEL[type]) return TYPE_TO_LABEL[type];
  return type;
}

module.exports = {
  TYPE_TO_LABEL,
  normalizeViolationLabel,
};
