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

  if (isEditing) {
    return (
      <Card className="transition-all hover:shadow-lg bg-white">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Team Name
              </label>
              <Input
                value={editingTeam.teamName}
                onChange={(e) =>
                  onEditChange({ ...editingTeam, teamName: e.target.value })
                }
                className="bg-white text-gray-900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Description
              </label>
              <Textarea
                value={editingTeam.description}
                onChange={(e) =>
                  onEditChange({ ...editingTeam, description: e.target.value })
                }
                rows={3}
                className="bg-white text-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={onSaveEdit}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                Save
              </Button>
              <Button
                onClick={onCancelEdit}
                variant="outline"
                className="flex-1 text-gray-900 border-gray-300 cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`transition-all hover:shadow-lg bg-white ${
        team.presenting
          ? "border-green-500 bg-green-50"
          : team.presented
          ? "border-muted opacity-60"
          : ""
      }`}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg text-gray-900">
            {team.teamName}
          </CardTitle>
          <div className="flex gap-1">
            {team.presenting && (
              <Badge className="bg-green-500 text-white">Presenting</Badge>
            )}
            {team.presented && (
              <Badge variant="secondary" className="bg-gray-200 text-gray-800">
                Presented
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="line-clamp-2 min-h-[40px] text-gray-600">
          {team.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 p-3 bg-gray-100 rounded-lg">
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">👍 Yes</div>
            <div className="text-xl font-bold text-gray-900">{team.nyes}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-600 mb-1">👎 No</div>
            <div className="text-xl font-bold text-gray-900">{team.nno}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!team.presenting && !team.presented && (
            <Button
              onClick={() => onSetPresenting(team._id)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white cursor-pointer"
              size="sm"
            >
              <Play className="mr-1 h-3 w-3" />
              Present
            </Button>
          )}
          {!team.presenting && !team.presented && (
            <>
              <Button
                onClick={() => onStartEdit(team)}
                variant="outline"
                size="sm"
                className="text-gray-900 border-gray-300 hover:bg-gray-100 cursor-pointer"
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                onClick={() => onDelete(team._id, team.teamName)}
                variant="destructive"
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white cursor-pointer"
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
