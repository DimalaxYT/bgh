"use client";

import { useRef, useState } from "react";
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

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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

export function PusherSection({ onMutate }: { onMutate: () => void }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<PushFile[]>([]);
  const [textPath, setTextPath] = useState("");
  const [textContent, setTextContent] = useState("");
  const [message, setMessage] = useState("");
  const [pushing, setPushing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFilesFromList = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    const added: PushFile[] = [];
    for (const f of arr) {
      const isZip = f.name.toLowerCase().endsWith(".zip");
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          path: cleanPath(f.name),
          contentBase64: bytesToB64(buf),
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
    const b64 = bytesToB64(new TextEncoder().encode(textContent));
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
        onMutate();
      } else {
        const hint =
          res.status === 403
            ? " Vérifie la permission « Contents: Read and write » du token actif."
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
    <div className="grid gap-6 lg:grid-cols-2">
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
                    if (e.dataTransfer.files) addFilesFromList(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                    dragging
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"
                  }`}
                >
                  <FileArchive className="h-8 w-8 text-emerald-500" aria-hidden="true" />
                  <p className="text-sm text-zinc-300 font-medium">Glisse tes fichiers ici</p>
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
                      if (e.target.files) addFilesFromList(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6">
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
            {files.length > 0 ? (
              <ul className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
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
                        <Badge
                          variant="outline"
                          className="text-amber-500 border-amber-500/40 shrink-0"
                        >
                          extracté
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-zinc-500">{formatSize(f.size)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
                        aria-label={`Retirer ${f.path}`}
                        className="h-8 w-8 p-0 text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-zinc-600">Le lot apparaîtra ici.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle>Commit</CardTitle>
            <CardDescription className="text-zinc-400">
              Un seul commit propre pour tout le lot.
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
    </div>
  );
}
