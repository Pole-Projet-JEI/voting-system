import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Plus } from "lucide-react";

export const AddTeamForm = ({
  teamName,
  description,
  onTeamNameChange,
  onDescriptionChange,
  onSubmit,
}) => {
  return (
    <Card className="mb-8 border-primary bg-panel">
      <CardHeader>
        <CardTitle className="text-ink">Create New Team</CardTitle>
        <CardDescription className="text-muted">
          Add a new team to the voting system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink">
                Team Name <span className="text-danger">*</span>
              </label>
              <Input
                value={teamName}
                onChange={(e) => onTeamNameChange(e.target.value)}
                placeholder="Enter team name"
                required
                className="bg-panel text-ink"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-ink">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Enter team description (optional)"
                className="bg-panel text-ink"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="bg-hackathon hover:bg-hackathon-hover text-white cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
