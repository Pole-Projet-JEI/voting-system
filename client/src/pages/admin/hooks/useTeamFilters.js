import { useState, useMemo } from "react";

export const useTeamFilters = (teams) => {
  const [sortOrder, setSortOrder] = useState("yes-desc"); // 'default', '', 'yes-asc'

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
