import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import './style.css';

function Ticker() {
  const [quote, setQuote] = useState();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState();
  const inFlight = useRef(false);
  const closeTimer = useRef();
  const trigger = useRef();
  const hoverRequest = useRef(0);

  // 给指针留出从行情条移到详情的时间，并丢弃过期的窗口响应。
  function changeDetails(open) {
    clearTimeout(closeTimer.current);
    const request = ++hoverRequest.current;
    if (!open) {
      // 原生窗口缩小前先提交紧凑布局，避免旧详情挤占行情条的可见区域。
      flushSync(() => setDetails(undefined));
    }
    void window.ticker.details(open).then((above) => {
      if (open && hoverRequest.current === request) setDetails(above);
    });
  }

  const refresh = useCallback(async (force = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (force) setBusy(true);
    try {
      setQuote(await window.ticker.quote(force));
      setFailed(false);
    } catch {
      // 断网时保留最后一次成功行情，并标出获取失败。
      setFailed(true);
    } finally {
      inFlight.current = false;
      if (force) setBusy(false);
    }
  }, []);

  // 秒级刷新由主进程判断时段，手动刷新在收盘后也可使用。
  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(closeTimer.current);
    };
  }, [refresh]);

  const volumeLabel = quote?.volume && `${quote.volumeDirection === 'up' ? '放量' : '缩量'} ${quote.volume} 亿`;

  return (
    <main className={details === true ? 'above' : undefined}
      onPointerEnter={() => clearTimeout(closeTimer.current)}
      onPointerLeave={() => {
        clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => changeDetails(false), 140);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(':hover')) {
          changeDetails(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || details === undefined) return;
        trigger.current.focus();
        changeDetails(false);
      }}
    >
      <div className="bar">
        <span className="drag" aria-hidden="true"
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary) return;
            // 按住手柄时捕获指针，拖到窗口外也能继续接收事件。
            clearTimeout(closeTimer.current);
            event.currentTarget.setPointerCapture(event.pointerId);
            window.ticker.drag('start');
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) window.ticker.drag('move');
          }}
          onLostPointerCapture={() => window.ticker.drag('end')}
        >⠿</span>
        <button type="button" className="metrics" ref={trigger} aria-expanded={details !== undefined} aria-controls="quote-details"
          aria-label={quote ? `${quote.price} 点，${quote.percent}${volumeLabel ? `，${volumeLabel}` : ''}，行情详情` : failed ? '行情获取失败' : '正在获取行情'}
          onPointerEnter={() => changeDetails(true)}
          onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) changeDetails(true); }}
          onClick={() => changeDetails(true)}
        >
          {quote ? (
            <>
              <span className={quote.direction}>{quote.price}</span>
              <span className={quote.direction}>{quote.percent}</span>
              {quote.volume && <span className={`volume ${quote.volumeDirection}`}>{quote.volume}</span>}
            </>
          ) : <span role="status">{failed ? '获取失败' : '···'}</span>}
          {failed && quote && <span className="warning" role="status" aria-label="当前显示上次行情">!</span>}
        </button>
      </div>
      <section id="quote-details" className="details" hidden={details === undefined} aria-label="行情详情">
        {quote && (
          <table>
            <thead><tr><th scope="col">指标</th><th scope="col">今日</th><th scope="col">昨日</th></tr></thead>
            <tbody>
              {quote.details.map(([label, today, yesterday, direction, previousDirection]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className={direction} aria-label={direction ? volumeLabel || undefined : undefined}>{today}</td>
                  <td className={previousDirection} aria-label={previousDirection === 'up' ? `放量 ${yesterday}` : previousDirection === 'down' ? `缩量 ${yesterday}` : undefined}>{yesterday}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="actions">
          <button type="button" title="刷新行情" aria-label="刷新行情" disabled={busy} onClick={() => void refresh(true)}>↻</button>
          <button type="button" title="关闭浮窗" aria-label="关闭浮窗" onClick={() => window.ticker.close()}>×</button>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Ticker />);
