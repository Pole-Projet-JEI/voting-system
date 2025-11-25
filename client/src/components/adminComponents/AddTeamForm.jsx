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
    <Card className="mb-8 border-primary bg-white">
      <CardHeader>
        <CardTitle className="text-gray-900">Create New Team</CardTitle>
        <CardDescription className="text-gray-600">
          Add a new team to the voting system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Team Name <span className="text-red-600">*</span>
              </label>
              <Input
                value={teamName}
                onChange={(e) => onTeamNameChange(e.target.value)}
                placeholder="Enter team name"
                required
                className="bg-white text-gray-900"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Enter team description (optional)"
                className="bg-white text-gray-900"
              />
            </div>
          </div>
          <Button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Team
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
