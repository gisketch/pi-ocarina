import { Badge } from "@/shared/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

export default <div className="grid max-w-xl gap-6">
  <div className="flex gap-2"><Badge>Running</Badge><Badge variant="secondary">Queued</Badge><Badge variant="outline">Idle</Badge><Badge variant="destructive">Failed</Badge></div>
  <Card><CardHeader><CardTitle>Thread state</CardTitle><CardDescription>Deterministic fixture data.</CardDescription></CardHeader><CardContent>Pi owns the session.</CardContent></Card>
  <Tabs defaultValue="timeline"><TabsList><TabsTrigger value="timeline">Timeline</TabsTrigger><TabsTrigger value="changes">Changes</TabsTrigger></TabsList><TabsContent value="timeline">Timeline content</TabsContent><TabsContent value="changes">Changes content</TabsContent></Tabs>
</div>;
