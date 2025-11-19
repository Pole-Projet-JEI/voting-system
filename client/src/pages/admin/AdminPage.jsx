import { useState, useEffect } from "react";
import { routes } from "../../service/apiRoutes";
import "./AdminPage.css";

function AdminPage() {
  const [teams, setTeams] = useState([]);
  const [presentingTeam, setPresentingTeam] = useState(null);
  const [stats, setStats] = useState({ voters: null, teams: null });
  const [loading, setLoading] = useState(true);

  // Fetch all data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [teamsRes, presentingRes] = await Promise.all([
        fetch(routes.ADMIN_TEAMS, { credentials: "include" }),
        fetch(routes.ADMIN_PRESENTING, { credentials: "include" }),
      ]);

      const teamsData = await teamsRes.json();
      const presentingData = await presentingRes.json();

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
    } finally {
      setLoading(false);
    }
  };

  // Set a team as presenting
  const handleSetPresenting = async (teamId) => {
    try {
      const response = await fetch(routes.ADMIN_PRESENTING, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ teamId }),
      });

      if (response.ok) {
        fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error("Error setting presenting team:", error);
      alert("Failed to set presenting team");
    }
  };

  // Stop presenting
  const handleStopPresenting = async () => {
    try {
      const response = await fetch(routes.ADMIN_PRESENTING, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        fetchData(); // Refresh data
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error("Error stopping presentation:", error);
      alert("Failed to stop presentation");
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">Loading admin panel...</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Admin Dashboard</h1>

      {/* Statistics */}
      <div className="stats-section">
        <h2>Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Teams</h3>
            <p className="stat-number">{stats.teams?.totalTeams || 0}</p>
            <p className="stat-detail">
              {stats.teams?.presentedTeams || 0} presented
            </p>
            <p className="stat-detail">
              {stats.teams?.notYetPresented || 0} pending
            </p>
          </div>
        </div>
      </div>

      {/* Current Presenting Team */}
      <div className="presenting-section">
        <h2>Currently Presenting</h2>
        {presentingTeam ? (
          <div className="presenting-team">
            <h3>{presentingTeam.name}</h3>
            <p>{presentingTeam.description}</p>
            <p className="vote-counts">
              Yes: {presentingTeam.nyes} | No: {presentingTeam.nno} | Score:{" "}
              {presentingTeam.score}
            </p>
            <button onClick={handleStopPresenting} className="btn-danger">
              Stop Presenting
            </button>
          </div>
        ) : (
          <p className="no-presenting">No team is currently presenting</p>
        )}
      </div>

      {/* Teams List */}
      <div className="teams-section">
        <h2>All Teams</h2>
        <div className="teams-list">
          {teams.map((team) => (
            <div
              key={team._id}
              className={`team-card ${team.presenting ? "presenting" : ""} ${
                team.presented ? "presented" : ""
              }`}
            >
              <div className="team-header">
                <h3>{team.name}</h3>
                {team.presenting && <span className="badge">Presenting</span>}
                {team.presented && (
                  <span className="badge-presented">Presented</span>
                )}
              </div>
              <p>{team.description}</p>
              <div className="team-stats">
                <span>Yes: {team.nyes}</span>
                <span>No: {team.nno}</span>
                <span>Score: {team.score}</span>
              </div>
              {!team.presenting && (
                <button
                  onClick={() => handleSetPresenting(team._id)}
                  className="btn-primary"
                >
                  Set as Presenting
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminPage;
