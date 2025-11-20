import { useState, useEffect } from "react";
import {
  getAllTeams,
  getPresentingTeam,
  setPresentingTeam as setPresentingTeamAPI,
  stopPresentingTeam,
  createTeam,
  updateTeam,
  deleteTeam,
} from "../../service/adminApi";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Badge } from "../../components/ui/badge";
import {
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Pencil,
  Trash2,
  Play,
  StopCircle,
} from "lucide-react";
import "./AdminPage.css";

// Reusable Components
const PresentingTeamCard = ({ team, onStopPresenting }) => {
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

const StatCard = ({ icon: Icon, title, value }) => (
  <Card className="bg-white/10 border-white/20 text-white backdrop-blur hover:bg-white/15 transition-all">
    <CardHeader className="pb-3">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

function AdminPage() {
  // Override body styles for admin page
  useEffect(() => {
    document.body.style.background = "white";
    document.body.style.overflow = "hidden";
    const overlay = document.querySelector("body::before");
    if (overlay) overlay.style.display = "none";

    return () => {
      document.body.style.background = "";
      document.body.style.overflow = "";
    };
  }, []);
  const [teams, setTeams] = useState([]);
  const [presentingTeam, setPresentingTeam] = useState(null);
  const [stats, setStats] = useState({ voters: null, teams: null });
  const [loading, setLoading] = useState(true);
  const [showAddTeamForm, setShowAddTeamForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [editingTeam, setEditingTeam] = useState(null);

  // Fetch all data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [teamsData, presentingData] = await Promise.all([
        getAllTeams(),
        getPresentingTeam(),
      ]);

      setTeams(teamsData.teams || []);
      setPresentingTeam(presentingData.team);

      // Calculate stats from teams data
      const totalTeams = teamsData.teams?.length || 0;
      const presentedTeams =
        teamsData.teams?.filter((t) => t.presented).length || 0;
      const currentlyPresenting =
        teamsData.teams?.filter((t) => t.presenting).length || 0;

      setStats({
        voters: null, // No voter stats endpoint available
        teams: {
          totalTeams,
          presentedTeams,
          notYetPresented: totalTeams - presentedTeams,
          currentlyPresenting,
        },
      });
    } catch (error) {
      console.error("Error fetching admin data:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to load admin data";
      alert(`✗ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Set a team as presenting
  const handleSetPresenting = async (teamId) => {
    try {
      console.log("Setting presenting team:", teamId);
      const response = await setPresentingTeamAPI(teamId);
      console.log("Response from setPresentingTeam:", response);

      // Show success message
      if (response && response.success) {
        alert(`✓ ${response.message}`);
        await fetchData(); // Refresh data
      } else {
        console.warn("Unexpected response format:", response);
        alert("✗ Unexpected response from server");
      }
    } catch (error) {
      console.error("Error setting presenting team:", error);

      // Extract error message from response
      const errorMessage =
        error.response?.data?.message || "Failed to set presenting team";
      alert(`✗ Error: ${errorMessage}`);
    }
  };

  // Stop presenting
  const handleStopPresenting = async () => {
    try {
      const response = await stopPresentingTeam();

      // Show success message
      if (response && response.success) {
        alert(`✓ ${response.message}`);
        fetchData(); // Refresh data
      } else if (response && response.message) {
        alert(`ℹ ${response.message}`);
        fetchData(); // Refresh data anyway
      }
    } catch (error) {
      console.error("Error stopping presentation:", error);

      // Extract error message from response
      const errorMessage =
        error.response?.data?.message || "Failed to stop presentation";
      alert(`✗ Error: ${errorMessage}`);
    }
  };

  // Create a new team
  const handleCreateTeam = async (e) => {
    e.preventDefault();

    if (!newTeamName.trim()) {
      alert("⚠ Team name is required");
      return;
    }

    try {
      const response = await createTeam(newTeamName, newTeamDescription);

      if (response && response.success) {
        alert(`✓ ${response.message}`);
        setNewTeamName("");
        setNewTeamDescription("");
        setShowAddTeamForm(false);
        fetchData(); // Refresh data
      }
    } catch (error) {
      console.error("Error creating team:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to create team";
      alert(`✗ Error: ${errorMessage}`);
    }
  };

  // Update a team
  const handleUpdateTeam = async (teamId, updates) => {
    try {
      const response = await updateTeam(teamId, updates);

      if (response && response.success) {
        alert(`✓ ${response.message}`);
        setEditingTeam(null);
        fetchData(); // Refresh data
      }
    } catch (error) {
      console.error("Error updating team:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to update team";
      alert(`✗ Error: ${errorMessage}`);
    }
  };

  // Delete a team
  const handleDeleteTeam = async (teamId, teamName) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete team "${teamName}"?`
    );

    if (!confirmed) return;

    try {
      const response = await deleteTeam(teamId);

      if (response && response.success) {
        alert(`✓ ${response.message}`);
        fetchData(); // Refresh data
      }
    } catch (error) {
      console.error("Error deleting team:", error);
      const errorMessage =
        error.response?.data?.message || "Failed to delete team";
      alert(`✗ Error: ${errorMessage}`);
    }
  };

  // Start editing a team
  const startEditingTeam = (team) => {
    setEditingTeam({
      id: team._id,
      teamName: team.teamName,
      description: team.description,
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTeam(null);
  };

  // Save edited team
  const saveEditedTeam = () => {
    if (!editingTeam.teamName.trim()) {
      alert("⚠ Team name cannot be empty");
      return;
    }

    handleUpdateTeam(editingTeam.id, {
      teamName: editingTeam.teamName,
      description: editingTeam.description,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-muted-foreground">
          Loading admin panel...
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page flex h-screen bg-white">
      {/* Sidebar */}
      <aside className="w-80 bg-gradient-to-b from-slate-900 to-slate-800 text-white overflow-y-auto shadow-xl">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Admin Panel</h1>
              <p className="text-sm text-slate-300">Voting Dashboard</p>
            </div>
          </div>
        </div>

        {/* Current Presenting Team */}
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Play className="h-5 w-5" />
            Currently Presenting
          </h3>
          <PresentingTeamCard
            team={presentingTeam}
            onStopPresenting={handleStopPresenting}
          />
        </div>

        {/* Statistics Cards */}
        <div className="p-6 space-y-4">
          <StatCard
            icon={Users}
            title="Total Teams"
            value={stats.teams?.totalTeams || 0}
          />
          <StatCard
            icon={CheckCircle2}
            title="Presented"
            value={stats.teams?.presentedTeams || 0}
          />
          <StatCard
            icon={Clock}
            title="Pending"
            value={stats.teams?.notYetPresented || 0}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              Team Management
            </h2>
            <Button
              onClick={() => setShowAddTeamForm(!showAddTeamForm)}
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {showAddTeamForm ? (
                <>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add New Team
                </>
              )}
            </Button>
          </div>

          {/* Add Team Form */}
          {showAddTeamForm && (
            <Card className="mb-8 border-primary bg-white">
              <CardHeader>
                <CardTitle className="text-gray-900">Create New Team</CardTitle>
                <CardDescription className="text-gray-600">
                  Add a new team to the voting system
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateTeam} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-900">
                        Team Name <span className="text-red-600">*</span>
                      </label>
                      <Input
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
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
                        value={newTeamDescription}
                        onChange={(e) => setNewTeamDescription(e.target.value)}
                        placeholder="Enter team description (optional)"
                        className="bg-white text-gray-900"
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Team
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Teams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <Card
                key={team._id}
                className={`transition-all hover:shadow-lg bg-white ${
                  team.presenting
                    ? "border-green-500 bg-green-50"
                    : team.presented
                    ? "border-muted opacity-60"
                    : ""
                }`}
              >
                {editingTeam?.id === team._id ? (
                  // Edit mode
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-900">
                          Team Name
                        </label>
                        <Input
                          value={editingTeam.teamName}
                          onChange={(e) =>
                            setEditingTeam({
                              ...editingTeam,
                              teamName: e.target.value,
                            })
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
                            setEditingTeam({
                              ...editingTeam,
                              description: e.target.value,
                            })
                          }
                          rows={3}
                          className="bg-white text-gray-900"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={saveEditedTeam}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          Save
                        </Button>
                        <Button
                          onClick={cancelEditing}
                          variant="outline"
                          className="flex-1 text-gray-900 border-gray-300"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                ) : (
                  // View mode
                  <>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg text-gray-900">
                          {team.teamName}
                        </CardTitle>
                        <div className="flex gap-1">
                          {team.presenting && (
                            <Badge className="bg-green-500 text-white">
                              Presenting
                            </Badge>
                          )}
                          {team.presented && (
                            <Badge
                              variant="secondary"
                              className="bg-gray-200 text-gray-800"
                            >
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
                          <div className="text-xs text-gray-600 mb-1">
                            👍 Yes
                          </div>
                          <div className="text-xl font-bold text-gray-900">
                            {team.nyes}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-gray-600 mb-1">
                            👎 No
                          </div>
                          <div className="text-xl font-bold text-gray-900">
                            {team.nno}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {!team.presenting && !team.presented && (
                          <Button
                            onClick={() => handleSetPresenting(team._id)}
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
                              onClick={() => startEditingTeam(team)}
                              variant="outline"
                              size="sm"
                              className="text-gray-900 border-gray-300 hover:bg-gray-100 cursor-pointer"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() =>
                                handleDeleteTeam(team._id, team.teamName)
                              }
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
                  </>
                )}
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminPage;
