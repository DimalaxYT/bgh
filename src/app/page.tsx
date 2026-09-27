"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket,
  FileText,
  FileArchive,
  Trash2,
  Loader2,
  Github,
  RefreshCw,
  KeyRound,
  FolderGit2,
  GitCommit,
  Link2,
  Plus,
} from "lucide-react";

interface PushFile {
  id: string;
  path: string;
  contentBase64: string;
  size: number;
  isZip: boolean;
}

interface CommitInfo {
  sha: string;
  message: string;
  url: string;
  date: string;
}

interface Status {
  tokenValid: boolean;
  login: string | null;
  repo: string;
  branch: string;
  repoFound: boolean;
  isPrivate: boolean | null;
  empty: boolean;
  error: string | null;
  commits: CommitInfo[];
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function fileToB64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return bytesToB64(new Uint8Array(buf));
}

function textToB64(text: string): string {
  return bytesToB64(new TextEncoder().encode(text));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function cleanPath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Home() {
  const { toast } = useToast();
  const [files, setFiles] = useState<PushFile[]>([]);
  const [textPath, setTextPath] = useState("");
  const [textContent, setTextContent] = useState("");
  const [message, setMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      const data = await res.json();
      setStatus(data.error && !data.tokenValid === undefined ? { ...data, error: data.error } : data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    const added: PushFile[] = [];
    for (const f of arr) {
      const isZip = f.name.toLowerCase().endsWith(".zip");
      try {
        const b64 = await fileToB64(f);
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          path: cleanPath(f.name),
          contentBase64: b64,
          size: f.size,
          isZip,
        });
      } catch {
        toast({
          title: "Fichier illisible",
          description: `${f.name} n'a pas pu être lu.`,
          variant: "destructive",
        });
      }
    }
    if (added.length > 0) {
      setFiles((prev) => [...prev, ...added]);
      toast({ title: `${added.length} fichier(s) ajouté(s) au lot` });
    }
  };

  const addTextFile = () => {
    const path = cleanPath(textPath.trim());
    if (!path || !textContent) {
      toast({
        title: "Il manque des infos",
        description: "Renseigne un nom de fichier et son contenu.",
        variant: "destructive",
      });
      return;
    }
    const b64 = textToB64(textContent);
    setFiles((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path,
        contentBase64: b64,
        size: textContent.length,
        isZip: false,
      },
    ]);
    setTextPath("");
    setTextContent("");
    toast({ title: "Fichier ajouté au lot", description: path });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const push = async () => {
    if (files.length === 0) return;
    setPushing(true);
    setResult(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim() || undefined,
          files: files.map((f) => ({
            path: f.path,
            content: f.contentBase64,
            extract: f.isZip,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        const txt = `Commit ${data.sha.slice(0, 7)} créé — ${data.files} fichier(s) poussé(s).`;
        setResult({ ok: true, text: txt, url: data.url });
        toast({ title: "Poussé sur GitHub !", description: txt });
        setFiles([]);
        setMessage("");
        refreshStatus();
      } else {
        const hint =
          res.status === 403
            ? " Vérifie que le token a bien la permission « Contents: Read and write »."
            : "";
        const txt = `${data.error ?? "Erreur inconnue"}${hint}`;
        setResult({ ok: false, text: txt });
        toast({ title: "Échec du push", description: txt, variant: "destructive" });
      }
    } catch {
      const txt = "Impossible de contacter le serveur.";
      setResult({ ok: false, text: txt });
      toast({ title: "Erreur réseau", description: txt, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Github className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">bgh pusher</h1>
              <p className="text-xs text-zinc-400">Fichiers → GitHub en un clic</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <Badge variant="outline" className="text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" />
                Vérification…
              </Badge>
            ) : status?.tokenValid ? (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                <KeyRound className="h-3 w-3 mr-1" aria-hidden="true" />
                Token OK · {status.login}
              </Badge>
            ) : (
              <Badge variant="destructive">
                <KeyRound className="h-3 w-3 mr-1" aria-hidden="true" />
                Token invalide
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshStatus}
              aria-label="Rafraîchir le statut"
              className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left column: input + batch + push */}
          <div className="flex flex-col gap-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                  Ajouter des fichiers
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Colle du code texte ou dépose des fichiers (.zip extracté automatiquement).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="text">
                  <TabsList className="bg-zinc-800">
                    <TabsTrigger value="text">Coller du texte</TabsTrigger>
                    <TabsTrigger value="upload">Fichiers / Zip</TabsTrigger>
                  </TabsList>

                  <TabsContent value="text" className="mt-4 flex flex-col gap-3">
                    <div>
                      <Label htmlFor="file-path" className="text-zinc-300">
                        Chemin du fichier
                      </Label>
                      <Input
                        id="file-path"
                        placeholder="ex : app/page.js ou README.md"
                        value={textPath}
                        onChange={(e) => setTextPath(e.target.value)}
                        className="bg-zinc-950 border-zinc-700 mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="file-content" className="text-zinc-300">
                        Contenu
                      </Label>
                      <Textarea
                        id="file-content"
                        placeholder="Colle ici le code ou le texte…"
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        className="bg-zinc-950 border-zinc-700 mt-1.5 min-h-40 font-mono text-sm"
                      />
                    </div>
                    <Button
                      onClick={addTextFile}
                      className="bg-emerald-600 hover:bg-emerald-500 w-full sm:w-auto"
                    >
                      <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                      Ajouter au lot
                    </Button>
                  </TabsContent>

                  <TabsContent value="upload" className="mt-4">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Zone de dépôt de fichiers"
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                        dragging
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
                      }`}
                    >
                      <FileArchive className="h-8 w-8 text-emerald-500" aria-hidden="true" />
                      <p className="text-sm text-zinc-300 font-medium">
                        Glisse tes fichiers ici
                      </p>
                      <p className="text-xs text-zinc-500">
                        ou clique pour parcourir — .zip extracté côté serveur
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        aria-hidden="true"
                        onChange={(e) => {
                          if (e.target.files) addFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Batch */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Lot à pousser</CardTitle>
                <CardDescription className="text-zinc-400">
                  {files.length === 0
                    ? "Aucun fichier en attente."
                    : `${files.length} fichier(s) — ${formatSize(totalSize)} au total.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {files.length > 0 && (
                  <ul className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {f.isZip ? (
                            <FileArchive className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                          )}
                          <span className="text-sm truncate font-mono" title={f.path}>
                            {f.path}
                          </span>
                          {f.isZip && (
                            <Badge variant="outline" className="text-amber-500 border-amber-500/40 shrink-0">
                              extracté
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-zinc-500">{formatSize(f.size)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(f.id)}
                            aria-label={`Retirer ${f.path}`}
                            className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Commit + push */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle>Commit</CardTitle>
                <CardDescription className="text-zinc-400">
                  Décris la modification — c'est le message qui apparaîtra dans l'historique GitHub.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div>
                  <Label htmlFor="commit-message" className="text-zinc-300">
                    Message de commit
                  </Label>
                  <Input
                    id="commit-message"
                    placeholder="ex : feat: ajout du tableau d'idées"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-zinc-950 border-zinc-700 mt-1.5"
                  />
                </div>
                <Button
                  onClick={push}
                  disabled={pushing || files.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 h-12 text-base font-semibold"
                >
                  {pushing ? (
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Rocket className="h-5 w-5 mr-2" aria-hidden="true" />
                  )}
                  {pushing ? "Pousse en cours…" : "Pousser vers GitHub"}
                </Button>

                {result && (
                  <Alert
                    className={
                      result.ok
                        ? "border-emerald-600/50 bg-emerald-600/10 text-emerald-100"
                        : "border-red-600/50 bg-red-600/10 text-red-100"
                    }
                  >
                    <AlertTitle>{result.ok ? "Succès" : "Échec"}</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center gap-2">
                      <span>{result.text}</span>
                      {result.url && (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline text-emerald-400 hover:text-emerald-300"
                        >
                          <Link2 className="h-3 w-3" aria-hidden="true" />
                          voir le commit
                        </a>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column: repo status + commits */}
          <div className="flex flex-col gap-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderGit2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                  Dépôt cible
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {statusLoading ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Chargement du statut…
                  </div>
                ) : status ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        {status.repo}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        branche : {status.branch}
                      </Badge>
                      {status.isPrivate !== null && (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                          {status.isPrivate ? "privé" : "public"}
                        </Badge>
                      )}
                    </div>
                    {status.error && (
                      <p className="text-red-400 text-xs mt-1">{status.error}</p>
                    )}
                    {status.repoFound && status.empty && !status.error && (
                      <p className="text-amber-400 text-xs">
                        Le dépôt est vide — le premier push créera la branche {status.branch}.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-red-400 text-xs">Statut indisponible.</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCommit className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                  Derniers commits
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Historique en direct depuis GitHub.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status && status.commits.length > 0 ? (
                  <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                    {status.commits.map((c) => (
                      <li
                        key={c.sha}
                        className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-emerald-400">{c.sha}</span>
                          <span className="text-xs text-zinc-500">{formatDate(c.date)}</span>
                        </div>
                        <p className="text-sm mt-1 truncate" title={c.message}>
                          {c.message}
                        </p>
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-400 mt-1"
                        >
                          <Link2 className="h-3 w-3" aria-hidden="true" />
                          voir sur GitHub
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-500">
                    {status?.empty || !status?.repoFound
                      ? "Aucun commit pour l'instant — le premier push apparaîtra ici."
                      : "Aucun commit à afficher."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer — sticky bottom */}
      <footer className="mt-auto border-t border-zinc-800 bg-zinc-900/60">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-zinc-500">
            bgh pusher — ton pont entre les IA et GitHub
          </span>
          <a
            href={`https://github.com/${status?.repo ?? "DimalaxYT/bgh"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-emerald-400"
          >
            dépôt sur GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
