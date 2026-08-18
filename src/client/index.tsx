/**
 * dsh-reboot — client half (browser / React).
 *
 * Adds a restart button above the sidebar Settings entry. It renders a Win11
 * style circular-arrow icon plus the 「重启」 label, styled to match the native
 * Settings trigger. Clicking POSTs to the host `/reboot` route and then polls
 * the origin until the restarted server responds, reloading once it does.
 */
import { createElement, useState, type ReactNode } from 'react'
import type { Context } from 'cordis'

/** Client services this plugin injects (slots for the sidebar footer action). */
export const inject = ['slots'] as const

interface SlotsFace {
  register(
    options: { name: string; id: string; order?: number; label?: string },
    component: (props: { wide: boolean }) => unknown,
  ): () => void
}

interface InjectedCtx extends Context {
  slots: SlotsFace
}

/** Button styles mirroring the native Settings trigger (`--dsw-alias-*` tokens). */
const CSS = [
  '.dsh-reboot-btn{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}',
  '.dsh-reboot-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-reboot-btn:disabled{opacity:.55;cursor:default}',
  '.dsh-reboot-btn-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}',
  '.dsh-reboot-label{white-space:nowrap;overflow:hidden}',
  '.dsh-reboot-spin{animation:dsh-reboot-spin 1s linear infinite}',
  '@keyframes dsh-reboot-spin{to{transform:rotate(360deg)}}',
].join('')

function injectCss(): void {
  if (document.querySelector('style[data-plugin="dsh-reboot"]')) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-reboot'
  tag.textContent = CSS
  document.head.appendChild(tag)
}

/** Win11-style circular-arrow (restart) glyph, stroke-based like the Fluent icons. */
function RestartIcon(props: { size: number; spin?: boolean }) {
  return createElement(
    'svg',
    {
      width: props.size,
      height: props.size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      className: props.spin ? 'dsh-reboot-spin' : undefined,
    },
    createElement('polyline', { points: '23 4 23 10 17 10' }),
    createElement('path', { d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' }),
  )
}

function RebootButton(props: { wide: boolean }) {
  const [busy, setBusy] = useState(false)
  const wide = props.wide

  const onClick = (): void => {
    if (busy) return
    setBusy(true)
    fetch('/reboot', { method: 'POST', cache: 'no-store' })
      .then(() => {
        // Reload only after the old server was observed DEAD, so the reload
        // lands on the freshly booted instance (never on the old one, whose
        // composition lacks newly installed plugins). Fall back to a plain
        // reload if the old server never actually went away.
        let sawDead = false
        let tries = 0
        const poll = (): void => {
          tries += 1
          fetch(window.location.origin + '/', { cache: 'no-store' }).then(
            () => {
              if (sawDead || tries > 30) window.location.reload()
              else setTimeout(poll, 1000)
            },
            () => {
              sawDead = true
              setTimeout(poll, 1000)
            },
          )
        }
        setTimeout(poll, 2000)
      })
      .catch(() => setBusy(false))
  }

  const size = wide ? 16 : 18
  const children: ReactNode[] = [createElement(RestartIcon, { size, spin: busy })]
  if (wide) children.push(createElement('span', { className: 'dsh-reboot-label' }, '重启'))

  return createElement(
    'button',
    {
      type: 'button',
      className: wide ? 'dsh-reboot-btn' : 'dsh-reboot-btn dsh-reboot-btn-rail',
      title: '重启',
      'aria-label': '重启',
      disabled: busy,
      onClick,
    },
    children,
  )
}

export function apply(ctx: InjectedCtx): void {
  injectCss()
  const dispose = ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'dsh-reboot', order: -1, label: '重启' },
    (props: { wide: boolean }) => createElement(RebootButton, { wide: props.wide }),
  )
  ctx.effect(() => dispose)
}
