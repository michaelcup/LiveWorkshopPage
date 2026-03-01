// =============================================================
// WEBINAR CONFIG — only edit this file to reschedule the event
// =============================================================
const WEBINAR = {
    date:         '2026-03-18',      // YYYY-MM-DD  (Eastern Time date)
    timeLocal:    '19:00:00',        // 24-hour format, Eastern Time
    tzOffset:     '-04:00',          // EDT = -04:00  |  EST = -05:00
    timeDisplay:  '7:00 PM Eastern', // Human-readable time shown on page
    durationMins: 45,
    zoomUrl:      'https://us06web.zoom.us/j/88302784507'
};

// Auto-derived values — call deriveWebinarFields() any time the raw config changes
function deriveWebinarFields() {
    const [h, m] = WEBINAR.timeLocal.split(':').map(Number);
    const endTotal = h * 60 + m + WEBINAR.durationMins;
    const endH = String(Math.floor(endTotal / 60)).padStart(2, '0');
    const endM = String(endTotal % 60).padStart(2, '0');

    WEBINAR.isoStart = `${WEBINAR.date}T${WEBINAR.timeLocal}${WEBINAR.tzOffset}`;
    WEBINAR.isoEnd   = `${WEBINAR.date}T${endH}:${endM}:00${WEBINAR.tzOffset}`;

    const [y, mo, d] = WEBINAR.date.split('-').map(Number);
    const utcDate = new Date(Date.UTC(y, mo - 1, d));

    WEBINAR.displayDate = utcDate.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', timeZone: 'UTC'
    });

    WEBINAR.displayDay = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday',
        'Thursday', 'Friday', 'Saturday'
    ][utcDate.getUTCDay()];

    WEBINAR.isPast = Date.now() > new Date(WEBINAR.isoStart).getTime();
}

deriveWebinarFields();
