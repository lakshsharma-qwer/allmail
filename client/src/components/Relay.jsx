import { n } from '../lib.jsx';

/**
 * The relay rail: each mailbox is a tank that fills as it sends today.
 * In sequential mode the baton sits on the first mailbox that still has room;
 * when it fills up, the baton moves along to the next.
 */
export default function Relay({ accounts, rotation = 'sequential', live = false, dark = false }) {
  if (!accounts?.length) return null;
  const usable = (a) => a.status === 'active' && a.remaining_today > 0;
  const currentId = rotation === 'sequential' ? accounts.find(usable)?.id : null;

  return (
    <div className={`relay ${dark ? 'dark' : ''}`} role="list" aria-label="Sending mailboxes in relay order">
      {accounts.map((a, i) => {
        const fill = a.daily_limit ? Math.min(1, a.sent_today / a.daily_limit) : 0;
        const full = a.remaining_today <= 0;
        const off = a.status !== 'active';
        const current = live && (rotation === 'round_robin' ? usable(a) : a.id === currentId);
        const prevFull = i > 0 && accounts[i - 1].remaining_today <= 0;
        const cls = ['box', current && 'current', full && 'full', off && 'off', a.status === 'error' && 'error'].filter(Boolean).join(' ');
        return (
          <div className="relay-stop" key={a.id} role="listitem">
            {i > 0 && <div className={`relay-link ${prevFull ? 'done' : ''}`} aria-hidden="true" />}
            <div className={cls} title={a.last_error || a.email}>
              {current && <span className="baton">Sending</span>}
              {!current && full && !off && <span className="baton ink">Full today</span>}
              {a.status === 'error' && <span className="baton stamp">Sign-in failed</span>}
              {a.status === 'paused' && <span className="baton ink">Paused</span>}
              <div className="spread">
                <span className="order">#{i + 1}</span>
                <span className="faint mono">{Math.round(fill * 100)}%</span>
              </div>
              <div className={`tank ${fill > 0.55 ? 'hi' : ''}`}>
                <i style={{ height: `${fill * 100}%` }} />
                <span>{n(a.sent_today)}</span>
              </div>
              <div>
                <div className="who">{a.label || a.email}</div>
                <div className="meta"><span>limit {n(a.daily_limit)}</span><span>{n(a.remaining_today)} left</span></div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
