import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAllTeams,
  getPresentingTeam,
  setPresentingTeam as setPresentingTeamAPI,
  stopPresentingTeam,
  createTeam,
  updateTeam,
  deleteTeam,
  adminLogout,
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
  LogOut,
} from "lucide-react";
import { PresentingTeamCard } from "./components/PresentingTeamCard";
import { StatCard } from "./components/StatCard";
import { TeamCard } from "./components/TeamCard";
import { AddTeamForm } from "./components/AddTeamForm";
import { useTeamFilters } from "./hooks/useTeamFilters";
import "./AdminPage.css";

function AdminPage() {
  const navigate = useNavigate();
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
    setLoading(true);

    const [teamsResult, presentingResult] = await Promise.all([
      getAllTeams(),
      getPresentingTeam(),
    ]);

    if (!teamsResult.success || !presentingResult.success) {
      alert(`✗ Error: ${teamsResult.error || presentingResult.error}`);
      setLoading(false);
      return;
    }

    setTeams(teamsResult.data.teams || []);
    setPresentingTeam(presentingResult.data.team);

    // Calculate stats from teams data
    const totalTeams = teamsResult.data.teams?.length || 0;
    const presentedTeams =
      teamsResult.data.teams?.filter((t) => t.presented).length || 0;
    const currentlyPresenting =
      teamsResult.data.teams?.filter((t) => t.presenting).length || 0;

    setStats({
      voters: null,
      teams: {
        totalTeams,
        presentedTeams,
        notYetPresented: totalTeams - presentedTeams,
        currentlyPresenting,
      },
    });

    setLoading(false);
  };

  // Set a team as presenting
  const handleSetPresenting = async (teamId) => {
    const result = await setPresentingTeamAPI(teamId);

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      await fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
    }
  };

  // Stop presenting
  const handleStopPresenting = async () => {
    const result = await stopPresentingTeam();

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
    }
  };

  // Create a new team
  const handleCreateTeam = async (e) => {
    e.preventDefault();

    if (!newTeamName.trim()) {
      alert("⚠ Team name is required");
      return;
    }

    const result = await createTeam(newTeamName, newTeamDescription);

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      setNewTeamName("");
      setNewTeamDescription("");
      setShowAddTeamForm(false);
      fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
    }
  };

  // Update a team
  const handleUpdateTeam = async (teamId, updates) => {
    const result = await updateTeam(teamId, updates);

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      setEditingTeam(null);
      fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
    }
  };

  // Delete a team
  const handleDeleteTeam = async (teamId, teamName) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete team "${teamName}"?`
    );

    if (!confirmed) return;

    const result = await deleteTeam(teamId);

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
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
          className: `${baseClass} border-gray-300 bg-gray-100 hover:bg-gray-200 text-gray-700`,
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

  // Logout handler
  const handleLogout = async () => {
    try {
      await adminLogout();
      navigate("/jvaFHT7xvivJPJqc1QBRWhfayoj/login");
    } catch (error) {
      console.error("Error during logout:", error);
      // Redirect anyway since token might be expired
      navigate("/jvaFHT7xvivJPJqc1QBRWhfayoj/login");
    }
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

        {/* Logout Button */}
        <div className="p-6 mt-auto">
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
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
