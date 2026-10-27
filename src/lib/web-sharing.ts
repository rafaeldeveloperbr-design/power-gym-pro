export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url; link.download = file.name
  document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export function isMobileWeb(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'>): boolean {
  return /Android|iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/i.test(nav.userAgent) && nav.maxTouchPoints > 1)
}
export async function shareWorkoutFile(file: File, nav: Pick<Navigator, 'share' | 'canShare'>, mobile: boolean): Promise<'shared' | 'cancelled' | 'download'> {
  if (mobile && typeof nav.share === 'function') {
    try {
      if (typeof nav.canShare !== 'function' || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Ficha de treino — Power Gym Pro' })
        return 'shared'
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled'
    }
  }
  return 'download'
}
