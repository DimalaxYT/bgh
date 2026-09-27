"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, Loader2, RotateCcw, Save } from "lucide-react";

interface SettingsState {
  hasToken: boolean;
  tokenMasked: string;
  tokenSource: "custom" | "env" | "none";
  repo: string;
  branch: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function SettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [current, setCurrent] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data: SettingsState = await res.json();
      setCurrent(data);
      setRepo(data.repo);
      setBranch(data.branch);
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setToken("");
      load();
    }
  }, [open]);

  const save = async () => {
    if (!token.trim()) {
      toast({
        title: "Token requis",
        description: "Colle un fine-grained PAT (ou utilise « Retour à l'env »).",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          repo: repo.trim(),
          branch: branch.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: "Configuration enregistrée",
          description: `Token validé pour ${data.repo} (branche ${data.branch}).`,
        });
        setToken("");
        onSaved();
        onOpenChange(false);
      } else {
        toast({ title: "Token refusé", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({ title: "Retour au token d'environnement" });
        setToken("");
        load();
        onSaved();
      } else {
        toast({ title: "Échec du reset", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-emerald-500" aria-hidden="true" />
            Token & dépôt
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Change le token ou le dépôt cible. Le token est validé auprès de GitHub avant
            enregistrement, stocké uniquement en mémoire du serveur et jamais renvoyé en clair.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Chargement…
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    current?.tokenSource === "custom"
                      ? "text-amber-400 border-amber-400/40"
                      : "text-emerald-400 border-emerald-400/40"
                  }
                >
                  {current?.tokenSource === "custom"
                    ? "token personnalisé"
                    : current?.tokenSource === "env"
                      ? "token d'environnement"
                      : "aucun token"}
                </Badge>
                {current?.hasToken && (
                  <span className="font-mono text-xs text-zinc-400">{current.tokenMasked}</span>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="settings-token" className="text-zinc-300">
                Nouveau token GitHub (fine-grained PAT)
              </Label>
              <Input
                id="settings-token"
                type="password"
                placeholder="github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="settings-repo" className="text-zinc-300">
                  Dépôt (propriétaire/nom)
                </Label>
                <Input
                  id="settings-repo"
                  placeholder="DimalaxYT/bgh"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                />
              </div>
              <div>
                <Label htmlFor="settings-branch" className="text-zinc-300">
                  Branche
                </Label>
                <Input
                  id="settings-branch"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="bg-zinc-950 border-zinc-700 mt-1.5 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={reset}
            disabled={saving || loading}
            className="border-zinc-700 bg-zinc-950 hover:bg-zinc-800"
          >
            <RotateCcw className="h-4 w-4 mr-1" aria-hidden="true" />
            Retour à l'env
          </Button>
          <Button onClick={save} disabled={saving || loading} className="bg-emerald-600 hover:bg-emerald-500">
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4 mr-1" aria-hidden="true" />
            )}
            Valider et enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
