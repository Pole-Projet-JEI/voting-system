import { Button } from "../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card";
import { StopCircle } from "lucide-react";

export const PresentingTeamCard = ({ team, onStopPresenting }) => {
  if (!team) {
    return (
      <p className="text-center py-8 text-sm text-slate-400 italic">
        No team presenting
      </p>
    );
  }

  return (
    <Card className="bg-white/15 border-white/20 text-white backdrop-blur">
      <CardHeader>
        <CardTitle className="text-lg">{team.teamName}</CardTitle>
        <CardDescription className="text-slate-300 line-clamp-2">
          {team.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-green-200 uppercase mb-1">Yes</div>
            <div className="text-2xl font-bold">{team.nyes}</div>
          </div>
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-xs text-red-200 uppercase mb-1">No</div>
            <div className="text-2xl font-bold">{team.nno}</div>
          </div>
        </div>
        <Button
          onClick={onStopPresenting}
          variant="destructive"
          className="w-full cursor-pointer hover:opacity-80 transition-opacity"
        >
          <StopCircle className="mr-2 h-4 w-4" />
          Stop Presenting
        </Button>
      </CardContent>
    </Card>
  );
};
