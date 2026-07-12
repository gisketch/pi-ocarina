import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";

export default <div className="flex gap-3">
  <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline">Dropdown</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem>Rename</DropdownMenuItem><DropdownMenuItem>Archive</DropdownMenuItem><DropdownMenuItem variant="destructive">Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  <Dialog><DialogTrigger asChild><Button>Dialog</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Rename thread</DialogTitle><DialogDescription>This name is saved in the Pi session.</DialogDescription></DialogHeader></DialogContent></Dialog>
  <Tooltip><TooltipTrigger asChild><Button variant="ghost">Hover me</Button></TooltipTrigger><TooltipContent>Useful context</TooltipContent></Tooltip>
</div>;
