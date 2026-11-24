import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Play, Pencil, Trash2 } from "lucide-react";

export const TeamCard = ({
  team,
  editingTeam,
  onSetPresenting,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditChange,
}) => {
  const isEditing = editingTeam?.id === team._id;
  const teamState =
    team.state || (team.presented ? "ended" : team.presenting ? "voting" : "pending");

  if (isEditing) {
    return (
      <Card className="transition-all hover:shadow-lg bg-panel">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">
                Nom de l'équipe
              </label>
              <Input
                value={editingTeam.teamName}
                onChange={(e) =>
                  onEditChange({ ...editingTeam, teamName: e.target.value })
                }
                className="bg-panel text-ink"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">
                Description
              </label>
              <Textarea
                value={editingTeam.description}
                onChange={(e) =>
                  onEditChange({ ...editingTeam, description: e.target.value })
                }
                rows={3}
                className="bg-panel text-ink"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onSaveEdit}
                className="flex-1 bg-transparent border border-line-strong hover:border-ink text-white cursor-pointer"
              >
                Enregistrer
              </Button>
              <Button
                onClick={onCancelEdit}
                variant="outline"
                className="flex-1 text-ink border-line-strong cursor-pointer"
              >
                Annuler
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`transition-all hover:shadow-lg bg-panel ${
        teamState === "presenting" || teamState === "voting"
          ? "border-hackathon bg-ok-ground"
          : team.presented
          ? "border-muted opacity-60"
          : ""
      }`}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg text-ink">
            {team.teamName}
          </CardTitle>
          <div className="flex gap-1">
            {teamState === "presenting" && (
              <Badge className="bg-blue-500 text-white">Sur scène</Badge>
            )}
            {teamState === "voting" && (
              <Badge className="bg-green-500 text-white">Vote ouvert</Badge>
            )}
            {team.presented && (
              <Badge variant="secondary" className="bg-gray-200 text-ink">
                Passée
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2 min-h-[40px] text-muted">
          {team.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 p-3 bg-panel-2 rounded-lg">
          <div className="text-center">
            <div className="text-xs text-muted mb-1">👍 Oui</div>
            <div className="text-xl font-bold text-ink">{team.nyes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted mb-1">👎 Non</div>
            <div className="text-xl font-bold text-ink">{team.nno}</div>
          </div>
          <div className="col-span-2 text-center text-[11px] text-faint">
            Décompte en direct (tous les votes). Résultat officiel : voir Résultats officiels.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {teamState === "pending" && !team.presenting && !team.presented && (
            <Button
              onClick={() => onSetPresenting(team._id)}
              className="flex-1 bg-hackathon hover:bg-hackathon-hover text-white cursor-pointer"
              size="sm"
            >
              <Play className="mr-1 h-3 w-3" />
              Présenter
            </Button>
          )}
          {teamState === "pending" && !team.presenting && !team.presented && (
            <>
              <Button
                onClick={() => onStartEdit(team)}
                variant="outline"
                size="sm"
                className="text-ink border-line-strong hover:bg-white/5 cursor-pointer"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                onClick={() => onDelete(team._id, team.teamName)}
                variant="destructive"
                size="sm"
                className="bg-jobfair hover:bg-jobfair-hover text-white cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
