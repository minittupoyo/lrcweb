import { ArrowDownToLine, ExternalLink, LoaderCircle, Music2, Search } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { timestamp } from '@/lib/lrc'
import { LrclibError, type LrclibRecord, searchLrclib } from '@/lib/lrclib'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  artist: string
  duration: number
  onImport: (record: LrclibRecord, mode: 'synced' | 'plain') => void
}
export function LrclibSearch({ open, onOpenChange, title, artist, duration, onImport }: Props) {
  const [track, setTrack] = useState('')
  const [artistQuery, setArtistQuery] = useState('')
  const [results, setResults] = useState<LrclibRecord[]>([])
  const [selected, setSelected] = useState<LrclibRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<'synced' | 'plain'>('synced')
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const request = useRef<AbortController | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setTrack(title)
      setArtistQuery(artist)
      setResults([])
      setSelected(null)
      setSearched(false)
      setError('')
    }
    wasOpen.current = open
    if (!open) {
      request.current?.abort()
      request.current = null
      setBusy(false)
    }
  }, [open, title, artist])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (retryAt <= Date.now()) return
    setNow(Date.now())
    const timer = setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= retryAt) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [retryAt])
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000))
  async function search(event: FormEvent) {
    event.preventDefault()
    if (request.current || retryAt > Date.now() || (!track.trim() && !artistQuery.trim())) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setResults([])
    setSelected(null)
    setSearched(false)
    try {
      const records = await searchLrclib(track, artistQuery, controller.signal)
      if (request.current !== controller) return
      setResults(records)
      setSearched(true)
      const first = records.find((r) => r.syncedLyrics || r.plainLyrics) || records[0] || null
      setSelected(first)
      setPreview(first?.syncedLyrics ? 'synced' : 'plain')
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return
      setError(
        error instanceof LrclibError
          ? error.message
          : error instanceof DOMException && error.name === 'TimeoutError'
            ? '検索がタイムアウトしました'
            : 'LRCLIB に接続できません',
      )
      if (error instanceof LrclibError && error.retryAt) {
        setRetryAt(error.retryAt)
        setNow(Date.now())
      }
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
      }
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lrclib-dialog">
        <DialogHeader>
          <DialogTitle>LRCLIB 検索</DialogTitle>
          <DialogDescription className="sr-only">
            歌詞を検索し、プレビューから取り込みます。現在の歌詞は置き換わり、元に戻せます。
          </DialogDescription>
        </DialogHeader>
        <form className="lrclib-search-form" onSubmit={(event) => void search(event)}>
          <label htmlFor="lrclib-track">
            曲名
            <Input
              id="lrclib-track"
              value={track}
              onChange={(event) => setTrack(event.target.value)}
              placeholder="曲名"
            />
          </label>
          <label htmlFor="lrclib-artist">
            アーティスト
            <Input
              id="lrclib-artist"
              value={artistQuery}
              onChange={(event) => setArtistQuery(event.target.value)}
              placeholder="アーティスト"
            />
          </label>
          <Button
            type="submit"
            disabled={busy || wait > 0 || (!track.trim() && !artistQuery.trim())}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Search />}
            {busy ? '検索中' : wait > 0 ? `${wait} 秒後に再検索` : '検索'}
          </Button>
        </form>
        {error && (
          <div className="lrclib-error" role="alert">
            {error}
          </div>
        )}
        <div className="lrclib-body" aria-busy={busy}>
          <section className="lrclib-results" aria-label="検索結果">
            <div className="lrclib-result-count" role="status">
              {busy ? '検索中…' : searched ? `${results.length} 件` : '検索結果'}
            </div>
            <div className="lrclib-result-list">
              {results.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={cn('lrclib-result', selected?.id === record.id && 'is-selected')}
                  aria-pressed={selected?.id === record.id}
                  onClick={() => {
                    setSelected(record)
                    setPreview(record.syncedLyrics ? 'synced' : 'plain')
                  }}
                >
                  <strong>{record.trackName}</strong>
                  <span>{record.artistName}</span>
                  <small>
                    {record.albumName || '—'} · {timestamp(record.duration).slice(0, -3)}
                  </small>
                  <div className="lrclib-badges">
                    {record.syncedLyrics && <Badge variant="secondary">LRC</Badge>}
                    {record.plainLyrics && <Badge variant="outline">テキスト</Badge>}
                    {!record.syncedLyrics && !record.plainLyrics && (
                      <Badge variant="outline">
                        {record.instrumental ? 'インスト' : '歌詞なし'}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
              {searched && !results.length && <div className="lrclib-empty">該当する歌詞なし</div>}
            </div>
          </section>
          <section className="lrclib-preview" aria-label="検索歌詞プレビュー">
            {selected ? (
              <>
                <div className="lrclib-preview-header">
                  <strong>{selected.trackName}</strong>
                  <span>
                    {selected.artistName} · {timestamp(selected.duration).slice(0, -3)}
                    {duration > 0 &&
                      `（音声との差 ${Math.abs(selected.duration - duration).toFixed(1)} 秒）`}
                  </span>
                  <div className="lrclib-preview-modes">
                    <Button
                      variant={preview === 'synced' ? 'secondary' : 'ghost'}
                      size="sm"
                      disabled={!selected.syncedLyrics}
                      onClick={() => setPreview('synced')}
                    >
                      LRC
                    </Button>
                    <Button
                      variant={preview === 'plain' ? 'secondary' : 'ghost'}
                      size="sm"
                      disabled={!selected.plainLyrics}
                      onClick={() => setPreview('plain')}
                    >
                      テキスト
                    </Button>
                  </div>
                </div>
                <pre className="lrclib-preview-text">
                  {(preview === 'synced' ? selected.syncedLyrics : selected.plainLyrics) ||
                    (selected.instrumental ? 'インスト' : '歌詞なし')}
                </pre>
                <div className="lrclib-import-actions">
                  <Button
                    disabled={
                      !(preview === 'synced' ? selected.syncedLyrics : selected.plainLyrics)
                    }
                    onClick={() => onImport(selected, preview)}
                  >
                    <ArrowDownToLine />
                    {preview === 'synced' ? 'LRC を取り込む' : 'テキストを取り込む'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="lrclib-empty">
                <Music2 size={24} />
                <span>プレビュー</span>
              </div>
            )}
          </section>
        </div>
        <div className="lrclib-dialog-footer">
          <span>取り込みで現在の歌詞を置換 · 元に戻す可</span>
          <a href="https://lrclib.net" target="_blank" rel="noreferrer">
            LRCLIB
            <ExternalLink size={12} />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
