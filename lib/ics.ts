export type IcsEvent = {
  name: string;
  start: string;
  end?: string;
  address?: string;
  description?: string;
};

const DEFAULT_PRODID = '-//il Catering//Bookings//EN';

const escapeText = (value?: string) =>
  (value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r?\n/g, '\\n');

const toIcsDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ICS date: ${value}`);
  }
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
};

export const buildIcs = (event: IcsEvent): string => {
  const dtStamp = toIcsDate(new Date().toISOString());
  const dtStart = toIcsDate(event.start);
  const dtEnd = event.end ? toIcsDate(event.end) : dtStart;
  const uid = `${Date.now()}@il_catering`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${DEFAULT_PRODID}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(event.name)}`,
  ];

  if (event.address) {
    lines.push(`LOCATION:${escapeText(event.address)}`);
  }

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
};
