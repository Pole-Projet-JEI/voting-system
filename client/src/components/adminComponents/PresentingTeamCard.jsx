import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Play, StopCircle } from "lucide-react";

export const PresentingTeamCard = ({
  team,
  onStartVoting,
  onStopPresenting,
}) => {
  if (!team) {
    return (
      <p className="text-center py-8 text-sm text-faint italic">
        Aucune équipe sur scène
      </p>
    );
  }
  const teamState = team.state || (team.presenting ? "voting" : "presenting");

  return (
    <Card className="bg-panel-2 border-line-strong text-white backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg">{team.teamName}</CardTitle>
        <CardDescription className="text-muted line-clamp-2">
          {team.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-ink">
          {teamState === "voting"
            ? "Le vote est ouvert"
            : "Présentation en cours"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-green-200 uppercase mb-1">Oui</div>
            <div className="text-2xl font-bold">{team.nyes}</div>
          </div>
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-red-200 uppercase mb-1">Non</div>
            <div className="text-2xl font-bold">{team.nno}</div>
          </div>
        </div>
        <p className="text-center text-[11px] text-faint">
          Décompte en direct de tous les votes. Seuls les votants qui votent pour toutes les équipes comptent dans les résultats officiels.
        </p>
        <div className="flex gap-2">
          {teamState !== "voting" && (
            <Button
              onClick={onStartVoting}
              className="flex-1 bg-hackathon hover:bg-hackathon-hover cursor-pointer text-white"
            >
              <Play className="mr-2 h-4 w-4" />
              Ouvrir le vote
            </Button>
          )}
          <Button
            onClick={onStopPresenting}
            variant="destructive"
            className="flex-1 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <StopCircle className="mr-2 h-4 w-4" />
            Terminer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
