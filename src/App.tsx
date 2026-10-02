import {
  AlignLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  FileMusic,
  Keyboard,
  Minus,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Volume2,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LrclibSearch } from '@/components/LrclibSearch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { adjustEditor, cursorRow, editorSource, parseEditor, stampEditor } from '@/lib/editor'
import {
  exportLrc,
  type Lyric,
  type Metadata,
  parseLrc,
  parseTime,
  timestamp,
  uid,
} from '@/lib/lrc'
import { importLrclib } from '@/lib/lrclib'
import { cn } from '@/lib/utils'

const waveformKeys = Array.from({ length: 180 }, (_, index) => `wave-${index}`)

type Project = { lyrics: Lyric[]; metadata: Metadata; source?: string }
function load(): Project {
  try {
    const p = JSON.parse(localStorage.getItem('lrc-studio-v1') || 'null')
    if (
      p &&
      (p.source === undefined || typeof p.source === 'string') &&
      Array.isArray(p.lyrics) &&
      p.lyrics.every(
        (l: Lyric) =>
          typeof l.id === 'string' &&
          typeof l.text === 'string' &&
          (l.time === null ||
            (typeof l.time === 'number' && Number.isFinite(l.time) && l.time >= 0)),
      ) &&
      typeof p.metadata?.title === 'string' &&
      typeof p.metadata?.artist === 'string' &&
      typeof p.metadata?.album === 'string' &&
      Number.isFinite(p.metadata?.offset)
    )
      return isUntouchedLegacyDemo(p) ? emptyProject() : p
  } catch {}
  return emptyProject()
}
function emptyProject(): Project {
  return { lyrics: [], metadata: { title: '', artist: '', album: '', offset: 0 }, source: '' }
}
function isUntouchedLegacyDemo(project: Project) {
  // Fingerprint of the original bundled sample; preserve any user modifications.
  if (
    project.lyrics.length !== 8 ||
    !project.lyrics.every((line, index) => line.id === `demo-${index}`)
  )
    return false
  if (
    project.source !== undefined &&
    project.source !== editorSource(project.lyrics, project.metadata)
  )
    return false
  const { title, artist, album, offset } = project.metadata
  const value = JSON.stringify([
    title,
    artist,
    album,
    offset,
    project.lyrics.map((line) => [line.id, line.text, line.time]),
  ])
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0 === 1958813336
}
export default function App() {
  const [project, setProject] = useState<Project>(load)
  const { lyrics, metadata } = project
  const [selected, setSelected] = useState(lyrics[0]?.id || '')
  const [tab, setTab] = useState('editor')
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(true)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioName, setAudioName] = useState('')
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState('1')
  const [volume, setVolume] = useState(0.8)
  const [wave, setWave] = useState<number[]>([])
  const [paste, setPaste] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [shift, setShift] = useState('0.5')
  const [help, setHelp] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [nudgeStep, setNudgeStep] = useState('0.1')
  const audio = useRef<HTMLAudioElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const lrcInput = useRef<HTMLInputElement>(null)
  const history = useRef<Project[]>([])
  const future = useRef<Project[]>([])
  const [, setRevision] = useState(0)
  const audioGeneration = useRef(0)
  const projectGeneration = useRef(0)
  const source = project.source ?? editorSource(lyrics, metadata)
  const lyricList = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tab !== 'editor') return
    const list = lyricList.current
    const row = list?.querySelector<HTMLElement>('[data-selected="true"]')
    if (list && row) {
      const top =
        list.scrollTop +
        row.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        (row.offsetHeight - list.clientHeight) / 2
      list.scrollTo({ top, behavior: 'instant' })
    }
  }, [selected, tab])
  const textEditor = useRef<HTMLTextAreaElement>(null)
  const caret = useRef(0)
  const pendingCaret = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !textEditor.current) return
    const position = pendingCaret.current
    pendingCaret.current = null
    textEditor.current.focus()
    textEditor.current.setSelectionRange(position, position)
    centerTextCaret(textEditor.current, position)
    caret.current = position
  })
  const notify = (s: string) => setNotice(s)
  const change = (next: Project, rawSource?: string) => {
    history.current.push(project)
    if (history.current.length > 80) history.current.shift()
    future.current = []
    setProject({ ...next, source: rawSource ?? editorSource(next.lyrics, next.metadata) })
    setRevision((v) => v + 1)
  }
  const updateLine = (id: string, patch: Partial<Lyric>) =>
    change({ ...project, lyrics: lyrics.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  const undo = () => {
    const p = history.current.pop()
    if (p) {
      future.current.push(project)
      setProject(p)
      setRevision((v) => v + 1)
    }
  }
  const redo = () => {
    const p = future.current.pop()
    if (p) {
      history.current.push(project)
      setProject(p)
      setRevision((v) => v + 1)
    }
  }
  useEffect(() => {
    setSaved(false)
    const t = setTimeout(() => {
      try {
        localStorage.setItem('lrc-studio-v1', JSON.stringify(project))
        setSaved(true)
      } catch {
        notify('自動保存できません。LRCを書き出して保存してください。')
      }
    }, 450)
    return () => clearTimeout(t)
  }, [project])
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(t)
  }, [notice])
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )
  const seek = (t: number) => {
    if (audio.current && audioUrl) {
      const next = Math.min(duration, Math.max(0, t))
      audio.current.currentTime = next
      setTime(next)
    }
  }
  const toggle = async () => {
    if (!audioUrl) {
      audioInput.current?.click()
      return
    }
    if (audio.current?.paused) {
      try {
        await audio.current.play()
      } catch {
        notify('音声を再生できません。別の音声ファイルをお試しください。')
      }
    } else audio.current?.pause()
  }
  const selectTextRow = (position: number) => {
    caret.current = position
    const row = parseEditor(source).rows[cursorRow(source, position)]
    setSelected(row?.indices.length ? lyrics[row.indices[0]]?.id || '' : '')
  }
  const stampText = (advance: boolean) => {
    if (!audioUrl) {
      notify('音声を読み込んでください')
      return
    }
    const result = stampEditor(
      source,
      caret.current,
      (audio.current?.currentTime || 0) + metadata.offset / 1000,
      advance,
    )
    if (!result) {
      notify('歌詞の行を選択してください')
      return
    }
    const parsed = parseEditor(result.source)
    pendingCaret.current = result.cursor
    caret.current = result.cursor
    change(parsed, result.source)
    const row = parsed.rows[cursorRow(result.source, result.cursor)]
    setSelected(parsed.lyrics[row.indices[0]]?.id || '')
  }
  const nudgeText = (direction: number) => {
    const result = adjustEditor(source, caret.current, direction * Number(nudgeStep))
    if (!result) {
      notify('タイムスタンプのある歌詞行を選択してください')
      return
    }
    if (result.source === source) return
    const parsed = parseEditor(result.source)
    pendingCaret.current = result.cursor
    caret.current = result.cursor
    change(parsed, result.source)
    const row = parsed.rows[cursorRow(result.source, result.cursor)]
    setSelected(parsed.lyrics[row.indices[0]]?.id || '')
  }
  const nudgeLine = (id: string, direction: number) => {
    const line = lyrics.find((l) => l.id === id)
    if (line?.time == null) return
    const next = Math.round(Math.max(0, line.time + direction * Number(nudgeStep)) * 100) / 100
    if (next === line.time) return
    setSelected(id)
    updateLine(id, { time: next })
  }
  const playText = async () => {
    if (!audioUrl) {
      notify('音声を読み込んでください')
      return
    }
    const row = parseEditor(source).rows[cursorRow(source, caret.current)]
    const lyric = row?.indices.length ? lyrics[row.indices[0]] : undefined
    if (lyric?.time == null) {
      notify('この行にはタイムスタンプがありません')
      return
    }
    seek(lyric.time - metadata.offset / 1000)
    try {
      await audio.current?.play()
    } catch {
      notify('音声を再生できません')
    }
  }
  const sync = () => {
    if (tab === 'text') {
      stampText(true)
      return
    }
    if (!audioUrl) {
      notify('まず音声ファイルを読み込んでください。')
      return
    }
    const i = lyrics.findIndex((l) => l.id === selected)
    if (i < 0) return
    updateLine(selected, {
      time: Math.max(0, (audio.current?.currentTime || 0) + metadata.offset / 1000),
    })
    setSelected(lyrics[i + 1]?.id || selected)
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat) return
      if ((e.target as HTMLElement).closest('[role="dialog"]')) return
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        ['Enter', 'KeyX', 'KeyZ', 'KeyK', 'KeyJ'].includes(e.code) &&
        tab === 'text' &&
        (e.target === textEditor.current ||
          !(e.target as HTMLElement).closest('input,textarea,select'))
      ) {
        e.preventDefault()
        if (e.code === 'KeyX') void playText()
        else if (e.code === 'KeyK' || e.code === 'KeyJ') nudgeText(e.code === 'KeyK' ? -1 : 1)
        else stampText(e.code === 'Enter')
        return
      }
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]'))
        return
      if (e.code === 'Space') {
        e.preventDefault()
        void toggle()
      }
      if (e.code === 'Enter' && !e.altKey) {
        e.preventDefault()
        sync()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const index = lyrics.findIndex((l) => l.id === selected)
        setSelected(
          lyrics[Math.max(0, Math.min(lyrics.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)))]
            ?.id || '',
        )
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  async function importAudio(file?: File) {
    if (!file) return
    const generation = ++audioGeneration.current
    setAudioUrl(URL.createObjectURL(file))
    setAudioName(file.name)
    setPlaying(false)
    setTime(0)
    setDuration(0)
    setWave([])
    let context: AudioContext | undefined
    try {
      context = new AudioContext()
      const decoded = await context.decodeAudioData(await file.arrayBuffer())
      const data = decoded.getChannelData(0)
      const bins = 180
      const values = Array.from({ length: bins }, (_, i) => {
        let max = 0
        const start = Math.floor((i * data.length) / bins),
          end = Math.floor(((i + 1) * data.length) / bins)
        for (let j = start; j < end; j += Math.max(1, Math.floor((end - start) / 150)))
          max = Math.max(max, Math.abs(data[j]))
        return max
      })
      if (generation === audioGeneration.current) setWave(values)
    } catch {
      if (generation === audioGeneration.current)
        notify('波形を表示できませんが、対応する音声は再生できます。')
    } finally {
      await context?.close()
    }
  }
  async function importLyrics(file?: File) {
    if (!file) return
    const generation = projectGeneration.current
    try {
      const parsed = parseLrc(await file.text())
      if (generation !== projectGeneration.current) return
      if (!parsed.lyrics.length) {
        notify('歌詞が見つかりませんでした。LRCまたはテキストを確認してください。')
        return
      }
      change(parsed)
      setSelected(parsed.lyrics[0].id)
      notify(`${parsed.lyrics.length} 行の歌詞を読み込みました`)
    } catch {
      if (generation === projectGeneration.current) notify('ファイルを読み込めませんでした。')
    }
  }
  const synced = lyrics.filter((l) => l.time !== null).length
  const output = exportLrc(lyrics, metadata)
  const ordered = lyrics.filter((l) => l.time !== null).sort((a, b) => a.time! - b.time!)
  const active = [...ordered].reverse().find((l) => l.time! <= time + metadata.offset / 1000)
  const exportFile = () => {
    if (!synced) {
      notify('タイムスタンプを設定してから書き出してください。')
      return
    }
    const url = URL.createObjectURL(new Blob([output], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${metadata.title.replace(/[\\/:*?"<>|]/g, '_') || 'lyrics'}.lrc`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notify(
      synced < lyrics.length
        ? `LRC を保存しました（未同期の ${lyrics.length - synced} 行は含まれません）`
        : 'LRC を保存しました',
    )
  }
  const addLine = () => {
    const id = uid()
    const index = lyrics.findIndex((l) => l.id === selected)
    const next = [...lyrics]
    next.splice(index < 0 ? next.length : index + 1, 0, { id, text: '', time: null })
    change({ ...project, lyrics: next })
    setSelected(id)
  }
  const reset = () => {
    const empty = emptyProject()
    projectGeneration.current++
    audioGeneration.current++
    audio.current?.pause()
    audio.current?.removeAttribute('src')
    audio.current?.load()
    setAudioUrl('')
    setAudioName('')
    setPlaying(false)
    setTime(0)
    setDuration(0)
    setWave([])
    setRate('1')
    setVolume(0.8)
    if (audio.current) {
      audio.current.playbackRate = 1
      audio.current.volume = 0.8
    }
    if (audioInput.current) audioInput.current.value = ''
    if (lrcInput.current) lrcInput.current.value = ''
    history.current = []
    future.current = []
    caret.current = 0
    pendingCaret.current = null
    setProject(empty)
    setSelected('')
    setTab('editor')
    setPaste('')
    setShift('0.5')
    setNudgeStep('0.1')
    setShowDetails(false)
    setPasteOpen(false)
    setSearchOpen(false)
    setHelp(false)
    setResetOpen(false)
    if (lyricList.current) lyricList.current.scrollTop = 0
    if (textEditor.current) {
      textEditor.current.scrollTop = 0
      textEditor.current.scrollLeft = 0
    }
    try {
      localStorage.setItem('lrc-studio-v1', JSON.stringify(empty))
      notify('リセットしました')
    } catch {
      notify('リセットしましたが、自動保存できませんでした')
    }
  }
  return (
    <div className="app-shell">
      <div className="main-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon">
              <AudioLines size={23} />
            </span>
            <span>
              LRC<span className="font-normal text-muted-foreground"> Studio</span>
            </span>
          </div>
          <div className="header-actions">
            <Button
              className="mobile-details-toggle"
              variant="ghost"
              size="icon"
              aria-label="楽曲情報とプレビュー"
              aria-pressed={showDetails}
              onClick={() => setShowDetails((value) => !value)}
            >
              <Settings2 size={19} />
            </Button>
            <span className="save-status">
              <Check size={14} />
              {saved ? '自動保存済み' : '保存中…'}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="キーボードショートカット"
              onClick={() => setHelp(true)}
            >
              <Keyboard size={19} />
            </Button>
            <Button
              className="reset-trigger"
              variant="ghost"
              size="icon"
              aria-label="リセット"
              title="リセット"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw size={19} />
            </Button>
            <Button
              className="lrclib-search-trigger"
              variant="outline"
              aria-label="LRCLIB から歌詞を検索"
              onClick={() => setSearchOpen(true)}
            >
              <Search />
              <span>LRCLIB</span>
            </Button>
            <Button
              className="lrc-import-trigger"
              variant="outline"
              onClick={() => lrcInput.current?.click()}
            >
              <ArrowUpFromLine />
              LRC を読み込む
            </Button>
            <Button onClick={exportFile}>
              <ArrowDownToLine />
              書き出す <span className="button-tag">.lrc</span>
            </Button>
          </div>
        </header>
        <main className="workspace">
          <h1 className="sr-only">歌詞エディター</h1>
          <input
            className="hidden"
            ref={audioInput}
            type="file"
            accept="audio/*"
            aria-label="音声ファイル"
            onChange={(e) => {
              void importAudio(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            className="hidden"
            ref={lrcInput}
            type="file"
            accept=".lrc,.txt"
            aria-label="歌詞ファイル"
            onChange={(e) => {
              void importLyrics(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag and drop supplements the keyboard-accessible file picker. */}
          <section
            className="audio-card"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              void importAudio(e.dataTransfer.files[0])
            }}
          >
            <div className="audio-heading">
              <div className="flex items-center gap-3">
                <span className="audio-symbol">
                  <Music2 size={20} />
                </span>
                <div>
                  <strong>{audioName || '音声ファイル'}</strong>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => audioInput.current?.click()}>
                <Plus size={15} />
                {audioName ? '音声を変更' : '音声を選択'}
              </Button>
            </div>
            {/* biome-ignore lint/a11y/useMediaCaption: The audio is a user-selected music track; lyrics are edited in the adjacent editor. */}
            <audio
              ref={audio}
              src={audioUrl || undefined}
              onLoadedMetadata={() => {
                if (audio.current) {
                  setDuration(Number.isFinite(audio.current.duration) ? audio.current.duration : 0)
                  audio.current.volume = volume
                  audio.current.playbackRate = Number(rate)
                }
              }}
              onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onError={() =>
                notify('この音声形式は再生できません。別のファイルを選択してください。')
              }
            />
            <div className={cn('waveform', !wave.length && 'empty-wave')}>
              <div className="wave-bars" aria-hidden="true">
                {(wave.length
                  ? wave
                  : Array.from(
                      { length: 180 },
                      (_, i) => 0.12 + Math.abs(Math.sin(i * 0.51) * Math.cos(i * 0.13)) * 0.7,
                    )
                ).map((v, i) => (
                  <span
                    key={waveformKeys[i]}
                    style={{ height: `${8 + v * 48}px` }}
                    className={wave.length && i / 180 <= time / duration ? 'played' : ''}
                  />
                ))}
              </div>
              <input
                type="range"
                className="wave-seek"
                min="0"
                max={duration || 1}
                step="0.01"
                value={time}
                disabled={!duration}
                aria-label="音声の再生位置"
                onChange={(e) => seek(Number(e.target.value))}
              />
              {duration > 0 && (
                <span className="playhead" style={{ left: `${(time / duration) * 100}%` }} />
              )}
            </div>
            <div className="player-controls">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="5秒戻る"
                  disabled={!audioUrl}
                  onClick={() => seek(time - 5)}
                >
                  <SkipBack size={17} />
                </Button>
                <Button
                  className="play-button"
                  size="icon"
                  aria-label={playing ? '一時停止' : '再生'}
                  onClick={() => void toggle()}
                >
                  {playing ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="5秒進む"
                  disabled={!audioUrl}
                  onClick={() => seek(time + 5)}
                >
                  <SkipForward size={17} />
                </Button>
                <span className="player-time">
                  {timestamp(time)} <span>/ {timestamp(duration)}</span>
                </span>
              </div>
              <div className="flex items-center gap-4">
                <label className="speed-label">
                  再生速度{' '}
                  <select
                    aria-label="再生速度"
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value)
                      if (audio.current) audio.current.playbackRate = Number(e.target.value)
                    }}
                  >
                    {['0.5', '0.75', '1', '1.25', '1.5', '2'].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
                <div className="volume-control">
                  <Volume2 size={16} />
                  <input
                    aria-label="音量"
                    type="range"
                    min="0"
                    max="1"
                    step=".01"
                    value={volume}
                    onChange={(e) => {
                      setVolume(Number(e.target.value))
                      if (audio.current) audio.current.volume = Number(e.target.value)
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
          <div className={cn('editor-grid', showDetails && 'show-details')}>
            <section className="editor-card">
              <Tabs
                value={tab}
                onValueChange={(value) => {
                  if (value === 'text') {
                    const index = lyrics.findIndex((l) => l.id === selected)
                    const row = parseEditor(source).rows.find((r) => r.indices.includes(index))
                    pendingCaret.current = row?.start || 0
                    caret.current = pendingCaret.current
                  }
                  setTab(value)
                }}
              >
                <div className="editor-toolbar">
                  <TabsList>
                    <TabsTrigger value="editor">
                      <AlignLeft size={15} />
                      歌詞編集
                    </TabsTrigger>
                    <TabsTrigger value="text">
                      <FileMusic size={15} />
                      テキスト / LRC
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="元に戻す"
                      disabled={!history.current.length}
                      onClick={undo}
                    >
                      <Undo2 size={17} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="やり直す"
                      disabled={!future.current.length}
                      onClick={redo}
                    >
                      <Redo2 size={17} />
                    </Button>
                    <div className="toolbar-divider" />
                    <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <Plus size={15} />
                          歌詞を追加
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>歌詞をまとめて追加</DialogTitle>
                          <DialogDescription className="sr-only">
                            改行ごとに歌詞の行を追加します。LRC も貼り付けられます。
                          </DialogDescription>
                        </DialogHeader>
                        <label htmlFor="paste" className="text-sm">
                          歌詞テキスト
                        </label>
                        <Textarea
                          id="paste"
                          rows={10}
                          value={paste}
                          onChange={(e) => setPaste(e.target.value)}
                          placeholder="ここに歌詞を貼り付けてください"
                        />
                        <Button
                          disabled={!paste.trim()}
                          onClick={() => {
                            const parsed = parseLrc(paste)
                            if (!parsed.lyrics.length) return
                            change({ ...project, lyrics: [...lyrics, ...parsed.lyrics] })
                            setSelected(parsed.lyrics[0].id)
                            setPaste('')
                            setPasteOpen(false)
                          }}
                        >
                          追加する
                        </Button>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
                <TabsContent value="editor">
                  <div className="table-head">
                    <span>#</span>
                    <span>タイムスタンプ</span>
                    <span>歌詞</span>
                    <span />
                  </div>
                  <div className="lyric-list" ref={lyricList}>
                    {lyrics.map((line, index) => (
                      <fieldset
                        key={line.id}
                        aria-label={`${index + 1}行目`}
                        onFocus={() => setSelected(line.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') setSelected(line.id)
                        }}
                        data-selected={selected === line.id}
                        className={cn('lyric-row', selected === line.id && 'selected')}
                        onClick={() => setSelected(line.id)}
                      >
                        <span className="line-number">
                          {selected === line.id ? (
                            <span className="selected-indicator" />
                          ) : (
                            String(index + 1).padStart(2, '0')
                          )}
                        </span>
                        <div className="time-cell">
                          <TimeInput
                            value={line.time}
                            onChange={(v) => updateLine(line.id, { time: v })}
                            index={index}
                          />
                          <button
                            type="button"
                            className="nudge-button"
                            aria-label={`${index + 1}行目を早める`}
                            title={`−${nudgeStep} 秒`}
                            disabled={line.time === null || line.time === 0}
                            onClick={(event) => {
                              event.stopPropagation()
                              nudgeLine(line.id, -1)
                            }}
                          >
                            <Minus size={13} />
                          </button>
                          <button
                            type="button"
                            className="nudge-button"
                            aria-label={`${index + 1}行目を遅らせる`}
                            title={`+${nudgeStep} 秒`}
                            disabled={line.time === null}
                            onClick={(event) => {
                              event.stopPropagation()
                              nudgeLine(line.id, 1)
                            }}
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <input
                          className="lyric-text"
                          aria-label={`歌詞 ${index + 1}`}
                          value={line.text}
                          placeholder="歌詞を入力…"
                          onFocus={() => setSelected(line.id)}
                          onChange={(e) => updateLine(line.id, { text: e.target.value })}
                        />
                        <div className="row-actions">
                          <button
                            type="button"
                            title="この時間から再生"
                            aria-label={`${index + 1}行目から再生`}
                            disabled={line.time === null || !audioUrl}
                            onClick={() =>
                              seek(Math.max(0, (line.time || 0) - metadata.offset / 1000))
                            }
                          >
                            <Play size={13} />
                          </button>
                          <button
                            type="button"
                            title="行を削除"
                            aria-label={`${index + 1}行目を削除`}
                            onClick={() => {
                              change({ ...project, lyrics: lyrics.filter((l) => l.id !== line.id) })
                              if (selected === line.id)
                                setSelected(lyrics[index + 1]?.id || lyrics[index - 1]?.id || '')
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </fieldset>
                    ))}
                    {!lyrics.length && (
                      <div className="empty-lyrics">
                        <FileMusic size={30} />
                        <p>歌詞なし</p>
                      </div>
                    )}
                  </div>
                  <button type="button" className="add-line" onClick={addLine}>
                    <Plus size={16} />
                    行を追加
                  </button>
                </TabsContent>
                <TabsContent value="text">
                  <div className="plain-editor">
                    <div className="text-editor-heading">
                      <label htmlFor="lyrics-source">歌詞 / LRC</label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(source)
                            notify('コピーしました')
                          } catch {
                            notify('コピーできません')
                          }
                        }}
                      >
                        <Copy size={14} />
                        コピー
                      </Button>
                    </div>
                    <Textarea
                      ref={(element) => {
                        textEditor.current = element
                        if (element && pendingCaret.current !== null) {
                          const position = pendingCaret.current
                          pendingCaret.current = null
                          element.focus()
                          element.setSelectionRange(position, position)
                          centerTextCaret(element, position)
                          caret.current = position
                        }
                      }}
                      id="lyrics-source"
                      wrap="off"
                      spellCheck={false}
                      value={source}
                      onSelect={(e) => selectTextRow(e.currentTarget.selectionStart)}
                      onChange={(e) => {
                        const text = e.target.value.replace(/\r\n?/g, '\n')
                        const position = e.target.selectionStart
                        const parsed = parseEditor(text)
                        change(parsed, text)
                        caret.current = position
                        const row = parsed.rows[cursorRow(text, position)]
                        setSelected(
                          row?.indices.length ? parsed.lyrics[row.indices[0]]?.id || '' : '',
                        )
                      }}
                      onKeyDown={(e) => {
                        if (
                          !e.nativeEvent.isComposing &&
                          (e.ctrlKey || e.metaKey) &&
                          !e.altKey &&
                          e.code === 'KeyZ'
                        ) {
                          e.preventDefault()
                          e.stopPropagation()
                          pendingCaret.current = e.currentTarget.selectionStart
                          e.shiftKey ? redo() : undo()
                        }
                      }}
                      placeholder="歌詞を入力…"
                    />
                    <div className="text-sync-actions">
                      <Button variant="outline" size="sm" onClick={() => stampText(false)}>
                        <Clock3 size={15} />
                        スタンプ<kbd>Alt+Z</kbd>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void playText()}>
                        <Play size={15} />
                        行から再生<kbd>Alt+X</kbd>
                      </Button>
                      <Button size="sm" onClick={() => stampText(true)}>
                        <Clock3 size={15} />
                        同期して次へ<kbd>Alt+Enter</kbd>
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              <div className="editor-footer">
                <span>
                  <span className="local-dot" />
                  {lyrics.length} 行 <span className="mx-2 text-border">|</span> {synced}{' '}
                  行を同期済み
                </span>
                <label className="nudge-step">
                  調整幅
                  <select
                    aria-label="行の微調整幅"
                    value={nudgeStep}
                    onChange={(event) => setNudgeStep(event.target.value)}
                  >
                    {['0.01', '0.05', '0.1', '0.25', '0.5', '1'].map((value) => (
                      <option key={value} value={value}>
                        {value} 秒
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
            <aside className="details-column" aria-label="楽曲情報とプレビュー">
              <section className="details-card">
                <div className="card-heading">
                  <Settings2 size={17} />
                  <h2>楽曲情報</h2>
                  <Badge variant="secondary">任意</Badge>
                </div>
                <div className="metadata-fields">
                  {(
                    [
                      ['title', '曲名', '曲名を入力'],
                      ['artist', 'アーティスト', 'アーティスト名を入力'],
                      ['album', 'アルバム', 'アルバム名を入力'],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label key={key} htmlFor={key}>
                      {label}
                      <Input
                        id={key}
                        value={metadata[key]}
                        placeholder={placeholder}
                        onChange={(e) =>
                          change({ ...project, metadata: { ...metadata, [key]: e.target.value } })
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="offset-section">
                  <label htmlFor="offset" title="正の値で歌詞表示を早めます">
                    <SlidersHorizontal size={14} />
                    オフセット <span>ms</span>
                  </label>
                  <Input
                    id="offset"
                    type="number"
                    step="100"
                    value={metadata.offset}
                    onChange={(e) =>
                      change({
                        ...project,
                        metadata: { ...metadata, offset: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </section>
              <section className="preview-card">
                <div className="preview-heading">
                  <span>
                    <Radio size={16} />
                    ライブプレビュー
                  </span>
                  <span className="preview-live">LIVE</span>
                </div>
                <div className="preview-content">
                  <AudioLines size={25} />
                  <p className="previous-lyric">
                    {active
                      ? ordered[ordered.findIndex((l) => l.id === active.id) - 1]?.text || ''
                      : metadata.title || '無題の歌詞'}
                  </p>
                  <p className="current-lyric">{active?.text || '—'}</p>
                  <p className="next-lyric">
                    {active
                      ? ordered[ordered.findIndex((l) => l.id === active.id) + 1]?.text || ''
                      : ''}
                  </p>
                  <span className="preview-timestamp">{timestamp(time)}</span>
                </div>
              </section>
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="shift-link">
                    <Clock3 size={15} />
                    タイミングをまとめて調整
                    <ChevronRight size={15} />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>タイミングをまとめて調整</DialogTitle>
                    <DialogDescription className="sr-only">
                      同期済みの行を秒数で移動します。負の値で早められます。
                    </DialogDescription>
                  </DialogHeader>
                  <label htmlFor="shift">移動する秒数</label>
                  <Input
                    id="shift"
                    type="number"
                    step="0.1"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                  />
                  <Button
                    disabled={!synced || !Number.isFinite(Number(shift))}
                    onClick={() => {
                      change({
                        ...project,
                        lyrics: lyrics.map((l) => ({
                          ...l,
                          time: l.time === null ? null : Math.max(0, l.time + Number(shift)),
                        })),
                      })
                      notify(`${shift} 秒調整しました`)
                    }}
                  >
                    調整する
                  </Button>
                </DialogContent>
              </Dialog>
            </aside>
          </div>
          <section className="sync-bar">
            <span className="sync-selection">
              {selected && lyrics.some((l) => l.id === selected)
                ? `${lyrics.findIndex((l) => l.id === selected) + 1} 行目`
                : '未選択'}
              <span className="sync-time">{timestamp(time)}</span>
            </span>
            <Button onClick={sync} disabled={!lyrics.length}>
              <Clock3 size={16} />
              現在の時間を同期<kbd>{tab === 'text' ? 'Alt+Enter' : 'Enter ↵'}</kbd>
            </Button>
          </section>
        </main>
      </div>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent
          className="reset-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('cancel-reset')?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>リセット</DialogTitle>
            <DialogDescription>歌詞・楽曲情報・音声・編集履歴を消去します。</DialogDescription>
          </DialogHeader>
          <div className="reset-actions">
            <Button id="cancel-reset" variant="outline" onClick={() => setResetOpen(false)}>
              キャンセル
            </Button>
            <Button variant="destructive" onClick={reset}>
              <RotateCcw size={15} />
              リセットする
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <LrclibSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title={metadata.title}
        artist={metadata.artist}
        duration={duration}
        onImport={(record, mode) => {
          try {
            const next = importLrclib(record, mode)
            change(next, next.source)
            setSelected(next.lyrics[0]?.id || '')
            caret.current = 0
            pendingCaret.current = null
            setShowDetails(false)
            setSearchOpen(false)
            setTab('text')
            notify('LRCLIB から歌詞を取り込みました')
          } catch (error) {
            notify(error instanceof Error ? error.message : '取り込めませんでした')
          }
        }}
      />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>キーボードショートカット</DialogTitle>
            <DialogDescription className="sr-only">
              入力欄の外で使えるショートカット
            </DialogDescription>
          </DialogHeader>
          <div className="shortcut-grid">
            <kbd>Alt + K / J</kbd>
            <span>カーソル行の時刻を早める / 遅らせる</span>
            <kbd>Alt + Enter</kbd>
            <span>カーソル行を同期して次へ</span>
            <kbd>Alt + X</kbd>
            <span>カーソル行の時刻から再生</span>
            <kbd>Alt + Z</kbd>
            <span>カーソル行に現在時刻をスタンプ</span>
            <kbd>Space</kbd>
            <span>再生 / 一時停止</span>
            <kbd>Enter</kbd>
            <span>選択行を同期して次へ</span>
            <kbd>↑ / ↓</kbd>
            <span>行を移動</span>
            <kbd>Ctrl / ⌘ + Z</kbd>
            <span>元に戻す</span>
            <kbd>Ctrl / ⌘ + Shift + Z</kbd>
            <span>やり直す</span>
          </div>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button type="button" aria-label="通知を閉じる" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
function TimeInput({
  value,
  onChange,
  index,
}: {
  value: number | null
  onChange: (v: number | null) => void
  index: number
}) {
  const [draft, setDraft] = useState(value === null ? '' : timestamp(value))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => {
    setDraft(value === null ? '' : timestamp(value))
    setInvalid(false)
  }, [value])
  return (
    <input
      className={cn('time-input', invalid && 'invalid')}
      aria-label={`タイムスタンプ ${index + 1}`}
      aria-invalid={invalid}
      title="mm:ss.xx（例: 00:12.50）"
      value={draft}
      placeholder="--:--.--"
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(false)
      }}
      onBlur={() => {
        if (!draft.trim()) {
          onChange(null)
          return
        }
        const parsed = parseTime(draft)
        if (parsed === null) {
          setInvalid(true)
          return
        }
        onChange(parsed)
        setDraft(timestamp(parsed))
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function centerTextCaret(editor: HTMLTextAreaElement, position: number) {
  const style = getComputedStyle(editor)
  const lineHeight = Number.parseFloat(style.lineHeight)
  const paddingTop = Number.parseFloat(style.paddingTop)
  const row = cursorRow(editor.value, position)
  editor.scrollTop = Math.max(0, paddingTop + (row + 0.5) * lineHeight - editor.clientHeight / 2)
}
