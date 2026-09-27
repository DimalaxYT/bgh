"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FolderGit2,
  FileText,
  FileWarning,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Link2,
  AlertTriangle,
} from "lucide-react";

interface TreeFile {
  path: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

interface Props {
  refreshSignal: number;
  onMutate: (commitUrl?: string) => void;
}

export function FilesSection({ refreshSignal, onMutate }: Props) {
  const { toast } = useToast();
  const [files, setFiles] = useState<TreeFile[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Édition
  const [editOpen, setEditOpen] = useState(false);
  const [editPath, setEditPath] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editBinary, setEditBinary] = useState(false);

  // Suppression
  const [deleteTarget, setDeleteTarget] = useState<TreeFile | null>(null);
  const [deleteSha, setDeleteSha] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Wipe (tout supprimer)
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wiping, setWiping] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files ?? []);
        setTruncated(!!data.truncated);
      } else {
        setError(data.error ?? "Erreur inconnue");
        setFiles([]);
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshSignal]);

  const openEditor = async (f: TreeFile) => {
    setEditPath(f.path);
    setEditContent("");
    setEditBinary(false);
    setEditLoading(true);
    setEditOpen(true);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(f.path)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setDeleteSha(data.sha);
        if (data.isText) {
          setEditContent(data.content);
          setEditBinary(false);
        } else {
          setEditBinary(true);
        }
      } else {
        toast({ title: "Lecture impossible", description: data.error, variant: "destructive" });
        setEditOpen(false);
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
      setEditOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const bytes = new TextEncoder().encode(editContent);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `edit: modification de ${editPath}`,
          files: [{ path: editPath, content: btoa(bin) }],
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "Fichier modifié", description: `Commit ${data.sha.slice(0, 7)}` });
        setEditOpen(false);
        loadFiles();
        onMutate(data.url);
      } else {
        toast({ title: "Échec de la modification", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const openDelete = async (f: TreeFile) => {
    setDeleteTarget(f);
    setDeleteSha("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(f.path)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.sha) {
        setDeleteSha(data.sha);
      } else {
        toast({
          title: "Impossible de préparer la suppression",
          description: data.error,
          variant: "destructive",
        });
        setDeleteTarget(null);
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !deleteSha) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: deleteTarget.path, sha: deleteSha }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "Fichier supprimé", description: deleteTarget.path });
        setDeleteTarget(null);
        loadFiles();
        onMutate(data.url);
      } else {
        toast({ title: "Échec de la suppression", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const confirmWipe = async () => {
    setWiping(true);
    try {
      const res = await fetch("/api/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "wipe: suppression de tous les fichiers via bgh-pusher" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.alreadyEmpty) {
          toast({ title: "Dépôt déjà vide", description: "Rien à supprimer." });
        } else {
          toast({
            title: "Dépôt vidé",
            description: `${data.removed} fichier(s) supprimé(s) — commit ${String(data.sha).slice(0, 7)}.`,
          });
          onMutate(data.url);
        }
        setWipeOpen(false);
        loadFiles();
      } else {
        toast({ title: "Échec du wipe", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setWiping(false);
    }
  };

  const filtered = files.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              Fichiers du dépôt
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {loading
                ? "Chargement…"
                : `${files.length} fichier(s) — modifie ou supprime directement.`}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadFiles}
            aria-label="Rafraîchir la liste des fichiers"
            className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
        <div className="relative mt-2">
          <Search
            className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            placeholder="Rechercher un fichier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Rechercher un fichier"
            className="bg-zinc-950 border-zinc-700 pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        {truncated && (
          <p className="text-xs text-amber-400 mb-2">
            Dépôt volumineux : liste partielle (limite GitHub).
          </p>
        )}
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Chargement de l'arborescence…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4 text-center">
            Aucun fichier {search ? "ne correspond à la recherche" : "dans ce dépôt"}.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
            {filtered.map((f) => (
              <li
                key={f.path}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                  <span className="text-sm truncate font-mono" title={f.path}>
                    {f.path}
                  </span>
                  <Badge variant="outline" className="border-zinc-800 text-zinc-500 shrink-0 hidden sm:inline-flex">
                    {formatSize(f.size)}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditor(f)}
                    aria-label={`Modifier ${f.path}`}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-400/10"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDelete(f)}
                    aria-label={`Supprimer ${f.path}`}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Zone de danger : vider le dépôt */}
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/5 p-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Vider le dépôt
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Supprime tous les fichiers en un seul commit « wipe ». Pratique juste avant de
              pousser un zip complet avec « Remplacer tout ».
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWipeOpen(true)}
            disabled={loading || files.length === 0 || wiping}
            aria-label="Supprimer tous les fichiers du dépôt"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 shrink-0"
          >
            <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
            Tout supprimer ({files.length})
          </Button>
        </div>
      </CardContent>

      {/* Dialoge d'édition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm text-emerald-400">{editPath}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Modifie le contenu — l'enregistrement crée un commit.
            </DialogDescription>
          </DialogHeader>
          {editLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Chargement du contenu…
            </div>
          ) : editBinary ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <FileWarning className="h-8 w-8 text-amber-500" aria-hidden="true" />
              <p className="text-sm text-zinc-300">
                Fichier binaire — l'édition texte n'est pas possible.
              </p>
              <p className="text-xs text-zinc-500">
                Tu peux le remplacer en le poussant avec le même chemin depuis l'onglet Pusher.
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="edit-content" className="sr-only">
                Contenu du fichier
              </Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="bg-zinc-950 border-zinc-700 min-h-72 font-mono text-sm"
              />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
            >
              Annuler
            </Button>
            <Button
              onClick={saveEdit}
              disabled={editLoading || editBinary || editSaving}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {editSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
              ) : (
                <Pencil className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Enregistrer le commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation de suppression */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce fichier ?</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-emerald-400">
              {deleteTarget?.path}
            </AlertDialogDescription>
            <AlertDialogDescription className="text-zinc-400">
              La suppression crée un commit sur GitHub. Le fichier restera dans l'historique
              (récupérable via un revert).
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteLoading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Préparation…
            </div>
          ) : (
            <AlertDialogFooter>
              <AlertDialogCancel className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800">
                Annuler
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirmDelete();
                }}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-500"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                )}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation du wipe complet */}
      <AlertDialog open={wipeOpen} onOpenChange={(o) => !o && setWipeOpen(false)}>
        <AlertDialogContent className="bg-zinc-900 border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" aria-hidden="true" />
              Vider tout le dépôt ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300">
              Les <b>{files.length}</b> fichier(s) actuellement visibles seront supprimés en un
              seul commit « wipe ».
            </AlertDialogDescription>
            <AlertDialogDescription className="text-zinc-500">
              L&apos;historique reste intact : chaque fichier reste récupérable via les commits
              précédents (revert ou checkout). Pense ensuite à pousser ton nouveau contenu
              (zip + « Remplacer tout »).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmWipe();
              }}
              disabled={wiping}
              className="bg-red-600 hover:bg-red-500"
            >
              {wiping ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Tout supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lien commit récent (informatif) */}
      <p className="sr-only">
        <Link2 aria-hidden="true" />
      </p>
    </Card>
  );
}
