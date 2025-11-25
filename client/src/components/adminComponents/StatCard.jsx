import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

export const StatCard = ({ icon: Icon, title, value }) => (
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
