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
  checkAdminAuth,
  changeAdminPassword,
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
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import { PresentingTeamCard } from "../../components/adminComponents/PresentingTeamCard";
import { StatCard } from "../../components/adminComponents/StatCard";
import { TeamCard } from "../../components/adminComponents/TeamCard";
import { AddTeamForm } from "../../components/adminComponents/AddTeamForm";
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
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const { sortOrder, setSortOrder, filteredAndSortedTeams } =
    useTeamFilters(teams);

  useEffect(() => {
    fetchData();
    checkAdminAuth().then((result) => {
      if (result.success) {
        setMustChangePassword(result.data.mustChangePassword === true);
      }
    });
  }, []);

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPasswordError("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all fields.");
      return;
    }

    const strongPassword =
      newPassword.length >= 8 &&
      /[a-z]/.test(newPassword) &&
      /[A-Z]/.test(newPassword) &&
      /\d/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword);

    if (!strongPassword) {
      setPasswordError(
        "Use 8+ characters with uppercase, lowercase, a number and a symbol."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    const result = await changeAdminPassword(currentPassword, newPassword);
    if (!result.success) {
      setPasswordError(result.error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMustChangePassword(false);
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

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

  const handleSetPresenting = async (teamId) => {
    const result = await setPresentingTeamAPI(teamId);

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      await fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);

    }
  };

  const handleStopPresenting = async () => {
    const result = await stopPresentingTeam();

    if (result.success) {
      alert(`✓ ${result.data.message}`);
      fetchData();
    } else {
      alert(`✗ Error: ${result.error}`);
    }
  };

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

  const startEditingTeam = (team) => {
    setEditingTeam({
      id: team._id,
      teamName: team.teamName,
      description: team.description,
    });
  };

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
      {mustChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <form
            onSubmit={handleChangePassword}
            noValidate
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Set a new password
              </h2>
              <p className="mt-1 text-sm text-slate-500">Required on first login.</p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="current-admin-password"
                className="block text-sm font-medium text-slate-700"
              >
                Temporary password
              </label>
              <div className="relative">
                <input
                  id="current-admin-password"
                  type={visiblePasswords.current ? "text" : "password"}
                  placeholder="Temporary password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-11 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("current")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900"
                  aria-label={
                    visiblePasswords.current
                      ? "Hide temporary password"
                      : "Show temporary password"
                  }
                >
                  {visiblePasswords.current ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="new-admin-password"
                className="block text-sm font-medium text-slate-700"
              >
                New password
              </label>
              <div className="relative">
                <input
                  id="new-admin-password"
                  type={visiblePasswords.new ? "text" : "password"}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-11 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("new")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900"
                  aria-label={
                    visiblePasswords.new
                      ? "Hide new password"
                      : "Show new password"
                  }
                >
                  {visiblePasswords.new ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                8+ chars: A-Z, a-z, 0-9 and a symbol.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="confirm-admin-password"
                className="block text-sm font-medium text-slate-700"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirm-admin-password"
                  type={visiblePasswords.confirm ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-11 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility("confirm")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-900"
                  aria-label={
                    visiblePasswords.confirm
                      ? "Hide confirmation password"
                      : "Show confirmation password"
                  }
                >
                  {visiblePasswords.confirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {passwordError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {passwordError}
              </div>
            )}

            <Button
              type="submit"
              className="w-full rounded-lg bg-slate-900 py-3 font-semibold text-white hover:bg-slate-800"
            >
              Save password
            </Button>
          </form>
        </div>
      )}
      {/* Sidebar */}
      <aside className="w-80 bg-gradient-to-b from-slate-900 to-slate-800 text-white overflow-y-auto shadow-xl">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8" />
              <div>
                <h1 className="text-2xl font-bold">Admin Panel</h1>
                <p className="text-sm text-slate-300">Voting Dashboard</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white hover:bg-white/10"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </Button>
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
