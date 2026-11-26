import sqlite3
import unittest
from pathlib import Path

SQL=(Path(__file__).resolve().parents[1]/"worker/migrations/0001_app.sql").read_text()
class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(":memory:")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript(SQL)
    def test_fixed_members(self):
        self.assertEqual(self.db.execute("SELECT count(*) FROM app_members").fetchone()[0],3)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO app_members(id,nickname) VALUES('m4','bad')")
    def create(self):
        self.db.execute("INSERT INTO app_invites(id,creator,mutation,game,title,created_at,expires_at,r1,r2,r3) VALUES ('game','m1','mut','apex','Apex',1,1800001,'ready','pending','pending')")
    def test_invite_atomic_and_idempotent(self):
        self.create()
        self.assertEqual(self.db.execute("SELECT member_id FROM app_messages ORDER BY member_id").fetchall(),[('m2',),('m3',)])
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO app_invites(id,creator,mutation,game,title,created_at,expires_at,r1,r2,r3) VALUES ('other','m1','mut','apex','Apex',1,1800001,'ready','pending','pending')")
        self.assertEqual(self.db.execute("SELECT count(*) FROM app_messages").fetchone()[0],2)
    def test_all_ready_message_once(self):
        self.create()
        self.db.execute("UPDATE app_invites SET r2='ready',revision=revision+1 WHERE id='game'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM app_messages WHERE kind='assembled'").fetchone()[0],0)
        self.db.execute("UPDATE app_invites SET r3='ready',revision=revision+1 WHERE id='game'")
        self.db.execute("UPDATE app_invites SET r3='ready',revision=revision+1 WHERE id='game'")
        self.assertEqual(self.db.execute("SELECT count(*) FROM app_messages WHERE kind='assembled'").fetchone()[0],3)
    def test_one_time_activation_atomic(self):
        self.db.execute("UPDATE app_members SET activation_hash='hash' WHERE id='m1'")
        sql="UPDATE app_members SET activation_hash=NULL,token_hash=?,activated_at=1 WHERE activation_hash=? AND activated_at IS NULL RETURNING id"
        self.assertEqual(self.db.execute(sql,('token','hash')).fetchone(),('m1',))
        self.assertIsNone(self.db.execute(sql,('other','hash')).fetchone())
if __name__=='__main__':
    unittest.main()
