import { useState, useMemo } from "react";

export const useTeamFilters = (teams) => {
  const [sortOrder, setSortOrder] = useState("default"); // 'default', 'yes-desc', 'yes-asc'

  const filteredAndSortedTeams = useMemo(() => {
    let result = [...teams];

    switch (sortOrder) {
      case "yes-desc":
        result.sort((a, b) => b.nyes - a.nyes);
        break;
      case "yes-asc":
        result.sort((a, b) => a.nyes - b.nyes);
        break;
      default:
        // Keep default order (by creation date or as received from API)
        break;
    }

    return result;
  }, [teams, sortOrder]);

  return {
    sortOrder,
    setSortOrder,
    filteredAndSortedTeams,
  };
};
