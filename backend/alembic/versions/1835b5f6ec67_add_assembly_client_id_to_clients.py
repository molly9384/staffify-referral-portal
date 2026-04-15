"""add assembly_client_id to clients

Revision ID: 1835b5f6ec67
Revises:
Create Date: 2026-04-15

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic
revision = '1835b5f6ec67'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'clients',
        sa.Column('assembly_client_id', sa.String(100), nullable=True)
    )
    op.create_index(
        'ix_clients_assembly_client_id',
        'clients',
        ['assembly_client_id'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_clients_assembly_client_id', table_name='clients')
    op.drop_column('clients', 'assembly_client_id')
