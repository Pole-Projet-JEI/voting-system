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
  BarChart3,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Play,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { PresentingTeamCard } from "./components/PresentingTeamCard";
import { StatCard } from "./components/StatCard";
import { TeamCard } from "./components/TeamCard";
import { AddTeamForm } from "./components/AddTeamForm";
import { useTeamFilters } from "./hooks/useTeamFilters";
import "./AdminPage.css";

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

  // Use filter hook
  const { sortOrder, setSortOrder, filteredAndSortedTeams } =
    useTeamFilters(teams);

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

  // Get filter button appearance
  const getFilterButton = () => {
    const baseClass = "cursor-pointer transition-all";
    switch (sortOrder) {
      case "yes-desc":
        return {
          icon: ArrowDown,
          variant: "default",
          text: "Most Votes",
          className: `${baseClass} bg-blue-600 hover:bg-blue-700 text-white`,
        };
      case "yes-asc":
        return {
          icon: ArrowUp,
          variant: "default",
          text: "Least Votes",
          className: `${baseClass} bg-blue-600 hover:bg-blue-700 text-white`,
        };
      default:
        return {
          icon: ArrowUpDown,
          variant: "outline",
          text: "Sort by Votes",
          className: `${baseClass} border-gray-300 hover:bg-gray-100`,
        };
    }
  };

  const cycleSort = () => {
    const order =
      sortOrder === "default"
        ? "yes-desc"
        : sortOrder === "yes-desc"
        ? "yes-asc"
        : "default";
    setSortOrder(order);
  };

  const filterBtn = getFilterButton();
  const FilterIcon = filterBtn.icon;

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
            <div className="flex gap-3">
              <Button
                onClick={cycleSort}
                variant={filterBtn.variant}
                className={filterBtn.className}
              >
                <FilterIcon className="mr-2 h-4 w-4" />
                {filterBtn.text}
              </Button>
              <Button
                onClick={() => setShowAddTeamForm(!showAddTeamForm)}
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white cursor-pointer"
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
          </div>

          {/* Add Team Form */}
          {showAddTeamForm && (
            <AddTeamForm
              teamName={newTeamName}
              description={newTeamDescription}
              onTeamNameChange={setNewTeamName}
              onDescriptionChange={setNewTeamDescription}
              onSubmit={handleCreateTeam}
            />
          )}

          {/* Teams Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedTeams.map((team) => (
              <TeamCard
                key={team._id}
                team={team}
                editingTeam={editingTeam}
                onSetPresenting={handleSetPresenting}
                onStartEdit={startEditingTeam}
                onSaveEdit={saveEditedTeam}
                onCancelEdit={cancelEditing}
                onDelete={handleDeleteTeam}
                onEditChange={setEditingTeam}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminPage;
