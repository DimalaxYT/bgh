"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  Eye,
  GitFork,
  Globe,
  Languages,
  Loader2,
  Lock,
  RefreshCw,
  Target,
} from "lucide-react";

interface DiscoveredRepo {
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string | null;
  language: string | null;
  pushedAt: string | null;
  fork: boolean;
  writable: boolean;
  score: number;
  reasons: string[];
}

function relTime(iso: string | null): string {
  if (!iso) return "jamais poussé";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 31) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  refreshSignal: number;
  currentRepo: string;
  onTargetChange: () => void;
}

export function ReposSection({ refreshSignal, currentRepo, onTargetChange }: Props) {
  const { toast } = useToast();
  const [login, setLogin] = useState<string | null>(null);
  const [repos, setRepos] = useState<DiscoveredRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<string | null>(null);

  const loadRepos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/repos", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.ok) {
        setLogin(data.login ?? null);
        setRepos(data.repos ?? []);
      } else {
        setError(data.error ?? `Erreur ${res.status}`);
        setRepos([]);
      }
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRepos();
  }, [loadRepos, refreshSignal]);

  const targetRepo = async (r: DiscoveredRepo) => {
    setTargeting(r.fullName);
    try {
      const res = await fetch("/api/target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: r.fullName, branch: r.defaultBranch }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast({
          title: "Cible changée",
          description: `${data.repo} · ${data.branch}${data.writable ? "" : " (lecture seule)"}`,
        });
        onTargetChange();
      } else {
        toast({ title: "Changement impossible", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur réseau", variant: "destructive" });
    } finally {
      setTargeting(null);
    }
  };

  const recommended = repos.find((r) => r.writable)?.fullName ?? null;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-emerald-500" aria-hidden="true" />
              Tes dépôts GitHub
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {loading
                ? "Chargement…"
                : error
                  ? "Scan impossible."
                  : `${repos.length} dépôt(s) accessibles${login ? ` avec le compte ${login}` : ""} — clique sur « Cibler » pour pousser, sauvegarder et gérer un dépôt.`}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRepos}
            disabled={loading}
            aria-label="Rafraîchir la liste des dépôts"
            className="border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-md border border-zinc-800 bg-zinc-950 animate-pulse" />
            ))}
          </div>
        ) : repos.length === 0 ? (
          <p className="text-sm text-zinc-500 py-6 text-center flex flex-col items-center gap-2">
            <Boxes className="h-8 w-8 text-zinc-700" aria-hidden="true" />
            Aucun dépôt accessible avec ce token.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 max-h-[34rem] overflow-y-auto pr-1">
            {repos.map((r) => {
              const isCurrent = r.fullName === currentRepo;
              return (
                <li
                  key={r.fullName}
                  className={`rounded-md border px-3 py-3 flex flex-col gap-2 transition-colors ${
                    isCurrent
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`https://github.com/${r.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-semibold text-zinc-100 hover:text-emerald-400 truncate"
                      title={r.fullName}
                    >
                      {r.fullName}
                    </a>
                    <a
                      href={`https://github.com/${r.fullName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Voir ${r.fullName} sur GitHub`}
                      className="text-zinc-500 hover:text-emerald-400 shrink-0 mt-0.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {isCurrent && (
                      <Badge className="bg-emerald-600 text-white border-transparent text-[11px] gap-1">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        cible actuelle
                      </Badge>
                    )}
                    {r.fullName === recommended && !isCurrent && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/50 text-emerald-400 text-[11px]"
                      >
                        recommandé
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="border-zinc-700 text-zinc-400 text-[11px] gap-1"
                    >
                      {r.isPrivate ? (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Globe className="h-3 w-3" aria-hidden="true" />
                      )}
                      {r.isPrivate ? "privé" : "public"}
                    </Badge>
                    {r.language && (
                      <Badge
                        variant="outline"
                        className="border-zinc-700 text-zinc-400 text-[11px] gap-1"
                      >
                        <Languages className="h-3 w-3" aria-hidden="true" />
                        {r.language}
                      </Badge>
                    )}
                    {r.fork && (
                      <Badge
                        variant="outline"
                        className="border-zinc-700 text-zinc-500 text-[11px] gap-1"
                      >
                        <GitFork className="h-3 w-3" aria-hidden="true" />
                        fork
                      </Badge>
                    )}
                    {!r.writable && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 text-amber-400 text-[11px] gap-1"
                      >
                        <Eye className="h-3 w-3" aria-hidden="true" />
                        lecture seule
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-zinc-500 line-clamp-2 min-h-8">
                    {r.description || "Pas de description."}
                  </p>

                  <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                    <span className="text-xs text-zinc-600 truncate">
                      {relTime(r.pushedAt)} · {r.defaultBranch}
                    </span>
                    {isCurrent ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-400 shrink-0"
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />
                        activé
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => targetRepo(r)}
                        disabled={targeting !== null}
                        aria-label={`Cibler le dépôt ${r.fullName}`}
                        className="bg-emerald-600 text-white hover:bg-emerald-500 h-8 shrink-0"
                      >
                        {targeting === r.fullName ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" aria-hidden="true" />
                        ) : (
                          <Target className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        )}
                        Cibler
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
