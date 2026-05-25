'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CommentForm } from './comment-form';
import { MessageSquare, Lock } from 'lucide-react';

interface CommentWithAuthor {
  id: string;
  ticket_id: string;
  author_id: string;
  content: string;
  is_internal: boolean;
  created_at: Date;
  updated_at: Date;
  authorName: string;
}

interface CommentThreadProps {
  ticketId: string;
  comments: CommentWithAuthor[];
}

export function CommentThread({ ticketId, comments }: CommentThreadProps) {
  return (
    <Card className="border-0 shadow-premium-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          Commentaires
          <Badge variant="secondary" className="font-normal text-xs ml-1">
            {comments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <CommentForm ticketId={ticketId} />

        {comments.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground mt-2">Aucun commentaire</p>
          </div>
        ) : (
          <div className="space-y-3 pt-4 border-t">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={`p-4 rounded-lg transition-colors ${
                  comment.is_internal
                    ? 'bg-[oklch(0.795_0.155_80)]/12/50 border border-[oklch(0.795_0.155_80)]/30/50'
                    : 'bg-muted/30 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {/* Avatar */}
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{comment.authorName}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {new Date(comment.created_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  {comment.is_internal && (
                    <Badge variant="outline" className="text-[12px] py-0 h-5 gap-1 bg-[oklch(0.795_0.155_80)]/12 text-[oklch(0.795_0.155_80)] border-[oklch(0.795_0.155_80)]/30">
                      <Lock className="w-2.5 h-2.5" />
                      Interne
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed pl-9">
                  {comment.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
